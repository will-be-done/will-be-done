import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  isProjectBackgroundImageUrl,
  isProjectBackgroundImageDataUrl,
  updateProject,
  type Project,
} from "@will-be-done/slices/space";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  prepareProjectBackgroundImage,
  inferProjectImageColors,
} from "./prepareProjectBackgroundImage";
import { getProjectCardStyle } from "@/lib/projectColors";

export function ProjectBackgroundDialog({ project }: { project: Project }) {
  const dispatch = useAsyncDispatch();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cardBackgroundColor, setCardBackgroundColor] = useState<string | null>(
    null,
  );
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [manualColors, setManualColors] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState("");
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const imageUrl = uploadedImage ?? url.trim();
  const validUrl = isProjectBackgroundImageUrl(imageUrl);
  const busy = saving || processing;

  async function choosePhoto(file: File) {
    setProcessing(true);
    setError("");
    try {
      const image = await prepareProjectBackgroundImage(file);
      setUploadedImage(image.imageUrl);
      setCardBackgroundColor(image.cardBackgroundColor);
      setAccentColor(image.accentColor);
      setManualColors(false);
      setUploadedName(file.name);
      setUrl("");
      setFailedPreviewUrl(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare this photo.",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function save(backgroundImageUrl: string | null) {
    setSaving(true);
    setError("");
    try {
      let colors = { cardBackgroundColor, accentColor };
      if (
        backgroundImageUrl &&
        !uploadedImage &&
        !manualColors &&
        backgroundImageUrl !== project.backgroundImageUrl
      ) {
        try {
          colors = await inferProjectImageColors(backgroundImageUrl);
        } catch {
          /* Remote hosts may disallow reading image pixels. Manual colors still work. */
        }
      }
      await dispatch(
        updateProject({
          id: project.id,
          project: { backgroundImageUrl, ...colors },
        }),
      );
      setOpen(false);
    } catch {
      setError("Could not save the background. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (busy) return;
        setOpen(nextOpen);
        if (nextOpen) {
          const currentImage = project.backgroundImageUrl ?? "";
          const isPhoto = isProjectBackgroundImageDataUrl(currentImage);
          setUrl(isPhoto ? "" : currentImage);
          setUploadedImage(isPhoto ? currentImage : null);
          setUploadedName(isPhoto ? "Uploaded photo" : "");
          setCardBackgroundColor(project.cardBackgroundColor ?? null);
          setAccentColor(project.accentColor ?? null);
          setManualColors(false);
          setError("");
          setFailedPreviewUrl(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          title="Change background"
          aria-label="Change background"
          className="cursor-pointer text-content-tinted hover:text-content transition-colors"
        >
          <ImageIcon className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-dialog-border bg-dialog-bg text-content shadow-2xl [&>button]:text-content-tinted">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (imageUrl && !validUrl) {
              setError("Enter a valid HTTP or HTTPS image URL");
              return;
            }
            void save(imageUrl || null);
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Project background</DialogTitle>
            <DialogDescription className="text-content-secondary">
              Upload a photo or paste an image link. Uploaded photos are resized
              automatically, sync across devices and work offline.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm">
            Upload photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={busy}
              aria-describedby="project-background-upload-help"
              className="w-full min-w-0 rounded-md border border-dialog-border bg-surface p-2 text-sm text-content file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-white disabled:opacity-50"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void choosePhoto(file);
              }}
            />
            <span
              id="project-background-upload-help"
              className="text-xs text-content-secondary"
            >
              JPEG, PNG, WebP or AVIF, up to 20 MB. Or use an image URL below.
            </span>
          </label>
          <p role="status" className="text-sm text-content-secondary">
            {processing ? "Preparing photo…" : uploadedName}
          </p>
          <label className="grid gap-2 text-sm">
            Image URL
            <Input
              type="url"
              placeholder="https://example.com/background.jpg"
              className="border-dialog-border bg-surface text-content placeholder:text-content-secondary focus-visible:border-accent focus-visible:ring-accent/40"
              value={url}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={error ? "project-background-error" : undefined}
              onChange={(event) => {
                setUrl(event.target.value);
                setUploadedImage(null);
                setUploadedName("");
                setError("");
              }}
            />
          </label>
          {validUrl && (
            <div className="relative h-36 overflow-hidden rounded-md bg-surface">
              <img
                key={imageUrl}
                src={imageUrl}
                alt="Background preview"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setFailedPreviewUrl(imageUrl)}
              />
              <div className="pointer-events-none absolute inset-0 bg-surface/70" />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-content">
                {failedPreviewUrl === imageUrl
                  ? "Image unavailable. Check the link."
                  : project.title}
              </span>
            </div>
          )}
          {error && (
            <p
              id="project-background-error"
              role="alert"
              className="text-sm text-notice"
            >
              {error}
            </p>
          )}
          <fieldset
            className="grid gap-3 rounded-md border border-dialog-border p-3"
            disabled={busy}
          >
            <legend className="px-1 text-sm">Project card colors</legend>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm">
                Background
                <input
                  type="color"
                  aria-label="Card background color"
                  value={cardBackgroundColor ?? "#243047"}
                  onChange={(event) => {
                    setCardBackgroundColor(event.target.value);
                    setManualColors(true);
                  }}
                  className="h-9 w-12 cursor-pointer rounded border border-dialog-border"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                Accent
                <input
                  type="color"
                  aria-label="Project accent color"
                  value={accentColor ?? "#60a5fa"}
                  onChange={(event) => {
                    setAccentColor(event.target.value);
                    setManualColors(true);
                  }}
                  className="h-9 w-12 cursor-pointer rounded border border-dialog-border"
                />
              </label>
            </div>
            <div
              className="rounded-md border-l-[3px] border-slate-500 bg-panel px-3 py-2 text-sm text-content"
              style={getProjectCardStyle({ cardBackgroundColor, accentColor })}
            >
              <span className="font-medium">Task preview</span>
              <span className="mt-1 block text-xs text-content-tinted">
                Used in this project, calendar and task lists.
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                disabled={busy || !validUrl}
                className="cursor-pointer text-content-tinted hover:text-content disabled:opacity-40"
                onClick={() => {
                  setProcessing(true);
                  setError("");
                  void inferProjectImageColors(imageUrl)
                    .then((colors) => {
                      setCardBackgroundColor(colors.cardBackgroundColor);
                      setAccentColor(colors.accentColor);
                      setManualColors(true);
                    })
                    .catch(() =>
                      setError(
                        "Cannot read colors from this link. Upload the photo or choose colors manually.",
                      ),
                    )
                    .finally(() => setProcessing(false));
                }}
              >
                Use image colors
              </button>
              <button
                type="button"
                className="cursor-pointer text-content-tinted hover:text-content"
                onClick={() => {
                  setCardBackgroundColor(null);
                  setAccentColor(null);
                  setManualColors(true);
                }}
              >
                Default colors
              </button>
            </div>
          </fieldset>
          <DialogFooter>
            {project.backgroundImageUrl && (
              <Button
                type="button"
                variant="ghost"
                className="text-content-tinted hover:bg-white/5 hover:text-content"
                disabled={busy}
                onClick={() => void save(null)}
              >
                Remove background
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="border-dialog-border bg-white/5 text-content-tinted hover:bg-white/10 hover:text-content"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-accent text-white hover:bg-accent-hover"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
