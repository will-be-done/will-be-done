# Compiling whisper.cpp

```bash
rm -rf build
CC=gcc-10 CXX=g++-10 cmake -B build \
  -DGGML_CUDA=1 \
  -DCMAKE_CUDA_ARCHITECTURES="75" \
  -DCMAKE_CXX_STANDARD=17 \
  -DCMAKE_CUDA_STANDARD=17 \
  -DCMAKE_CUDA_HOST_COMPILER=$HOME/gcc-10-host/gcc
```

Debug thread. Need to have correct gcc version!

https://t3.chat/chat/a9a6d923-64db-404a-9cde-c4f0dd660956

Also, tried docker cuda version - silent exit without error(maybe not enough mem?).
Didn't try k8s.

Also, had some problems with compiling it at github and running then on PC - dome instructions were missed.
So I made compiling at runtime, but still CPU dead slow.
