const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const PORT = 3284;

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let start = 0;

  while (true) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;

    if (start > 0) {
      const partData = buffer.slice(start, boundaryIndex);
      const headerEndIndex = partData.indexOf('\r\n\r\n');
      
      if (headerEndIndex !== -1) {
        const headers = partData.slice(0, headerEndIndex).toString();
        const content = partData.slice(headerEndIndex + 4);
        
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        
        if (nameMatch) {
          parts.push({
            name: nameMatch[1],
            filename: filenameMatch ? filenameMatch[1] : null,
            data: content.slice(0, -2) // Remove trailing \r\n
          });
        }
      }
    }
    
    start = boundaryIndex + boundaryBuffer.length + 2;
  }
  
  return parts;
}

async function convertAudioToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Converting audio to WAV: ${inputPath} -> ${outputPath}`);
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      outputPath
    ]);

    ffmpeg.stdout?.on('data', (data) => {
      console.log('ffmpeg(stdout):', data.toString());
    });

    ffmpeg.stderr?.on('data', (data) => {
      console.log('ffmpeg(stderr):', data.toString());
    });

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg process closed with code: ${code}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      console.log('FFmpeg process error:', err);
      reject(err);
    });
  });
}

async function transcribeWithWhisper(wavPath) {
  return new Promise((resolve, reject) => {
    console.log(`Starting transcription: ${wavPath}`);
    
    const whisper = spawn('./build/bin/whisper-cli', [
      '-m', 'models/ggml-large-v3.bin',
      '-f', wavPath,
      '-l', 'auto',
      '-nt',
      '-otxt'
    ]);

    let output = '';
    let error = '';

    whisper.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('whisper(stdout):', text);
    });

    whisper.stderr?.on('data', (data) => {
      const text = data.toString();
      error += text;
      console.log('whisper(stderr):', text);
    });

    whisper.on('close', (code) => {
      console.log(`Whisper process closed with code: ${code}`);
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Whisper failed with code ${code}: ${error}`));
      }
    });

    whisper.on('error', (err) => {
      console.log('Whisper process error:', err);
      reject(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/transcribe') {
    try {
      const contentType = req.headers['content-type'] || '';
      
      if (!contentType.includes('multipart/form-data')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }));
        return;
      }

      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing boundary in Content-Type' }));
        return;
      }

      let body = Buffer.alloc(0);
      req.on('data', chunk => {
        body = Buffer.concat([body, chunk]);
      });

      req.on('end', async () => {
        try {
          const parts = parseMultipart(body, boundary);
          const audioPart = parts.find(part => part.name === 'audio' && part.filename);

          if (!audioPart) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No audio file found in request' }));
            return;
          }

          const tempDir = os.tmpdir();
          const timestamp = Date.now();
          const fileExtension = path.extname(audioPart.filename) || '.mp3';
          const audioPath = path.join(tempDir, `audio_${timestamp}${fileExtension}`);
          const wavPath = path.join(tempDir, `audio_${timestamp}.wav`);

          console.log(`Received audio file: ${audioPart.filename} (${fileExtension})`);
          fs.writeFileSync(audioPath, audioPart.data);

          await convertAudioToWav(audioPath, wavPath);
          const transcript = await transcribeWithWhisper(wavPath);

          fs.unlinkSync(audioPath);
          fs.unlinkSync(wavPath);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: transcript }));

        } catch (error) {
          console.error('Transcription error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Transcription failed' }));
        }
      });

    } catch (error) {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Transcript server listening on port ${PORT}`);
});