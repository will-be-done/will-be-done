import { useRef, useState } from "react";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  ATTACHMENT_NODE,
  ATTACHMENT_URL_PREFIX,
  attachmentIdFromUrl,
} from "@will-be-done/slices/common";
import { attachmentById, type Attachment } from "@will-be-done/slices/space";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  isImageAttachment,
  openAttachment,
  shortFileName,
  useAttachmentTransfers,
  useAttachmentUrl,
  useRememberImageSize,
} from "@/components/Attachments/attachmentFiles";
import { AttachmentPreview } from "@/components/Attachments/AttachmentPreview";
import { pastedFiles } from "./filePaste";
import { attachAt, pendingInsertsPlugin } from "./pendingInserts";

export type AttachFiles = (files: File[]) => Promise<Attachment[]>;

const MIN_IMAGE_WIDTH = 48;
// An unsized image is capped at max-h-64.
const MAX_IMAGE_HEIGHT = 256;

type PixelSize = Pick<Attachment, "width" | "height">;

// The box an image takes in a description, known before its bytes load when
// the file has a stored size.
const imageBox = (width: number | null, pixels: PixelSize | undefined) => {
  if (!pixels?.width || !pixels.height) return width ? { width } : undefined;
  return {
    width:
      width ??
      Math.min(pixels.width, (MAX_IMAGE_HEIGHT * pixels.width) / pixels.height),
    aspectRatio: `${pixels.width} / ${pixels.height}`,
  };
};

// Dragging the corner handle sets the image's display width; double-clicking
// the handle returns it to its natural size.
function ResizableImage({
  url,
  name,
  width,
  pixels,
  editable,
  onResize,
  onOpen,
  onLoad,
}: {
  url: string;
  name: string;
  width: number | null;
  pixels: PixelSize | undefined;
  editable: boolean;
  onResize: (width: number | null) => void;
  onOpen: () => void;
  onLoad: (image: HTMLImageElement) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const box = imageBox(dragWidth ?? width, pixels);

  const startResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    const image = imageRef.current;
    if (event.button !== 0 || !image) return;
    // Keeps ProseMirror from selecting or dragging the node instead.
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = image.getBoundingClientRect().width;
    const maxWidth = image.closest(".ProseMirror")?.clientWidth ?? Infinity;
    let next = Math.round(startWidth);
    const move = (moveEvent: PointerEvent) => {
      next = Math.round(
        Math.min(
          maxWidth,
          Math.max(MIN_IMAGE_WIDTH, startWidth + moveEvent.clientX - startX),
        ),
      );
      setDragWidth(next);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragWidth(null);
      if (next !== Math.round(startWidth)) onResize(next);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <span className="group/image relative inline-block max-w-full align-bottom">
      <img
        ref={imageRef}
        src={url}
        alt={name}
        draggable={false}
        style={box}
        className={cn(
          "block max-w-full cursor-zoom-in rounded",
          !box && "max-h-64",
        )}
        onClick={onOpen}
        onLoad={(event) => onLoad(event.currentTarget)}
      />
      {editable && (
        <span
          role="separator"
          aria-label={`Resize ${name}`}
          title="Drag to resize, double-click to reset"
          data-testid="image-resize-handle"
          draggable={false}
          onPointerDown={startResize}
          onDragStart={(event) => event.preventDefault()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onResize(null);
          }}
          className={cn(
            "absolute right-1 bottom-1 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-white/80 bg-accent shadow transition-opacity",
            dragWidth === null &&
              "opacity-0 group-hover/image:opacity-100 focus-visible:opacity-100",
          )}
        />
      )}
    </span>
  );
}

// One inline file reference, shared by the editor and RichTextView so a title
// looks the same while it is being edited. Titles show every file as a chip.
export function InlineAttachment({
  src,
  alt,
  width,
  compact,
  onResize,
}: {
  src: unknown;
  alt: unknown;
  width: unknown;
  compact: boolean;
  // Editable when given.
  onResize?: (width: number | null) => void;
}) {
  const id = attachmentIdFromUrl(src);
  const transfers = useAttachmentTransfers();
  const { data: attachment } = useAsyncSelector({
    selector: attachmentById,
    args: { id: id ?? "" },
    enabled: !!id,
    defaultValue: undefined,
  });
  const image = attachment && isImageAttachment(attachment.mimeType);
  const url = useAttachmentUrl(image ? id : undefined);
  const name = attachment?.name ?? String(alt ?? "File");
  const [previewing, setPreviewing] = useState(false);
  const rememberSize = useRememberImageSize();
  const placeholder = imageBox(Number(width) || null, attachment);

  return (
    <>
      {image && !compact ? (
        url ? (
          <ResizableImage
            url={url}
            name={name}
            width={Number(width) || null}
            pixels={attachment}
            editable={!!onResize}
            onResize={(next) => onResize?.(next)}
            onOpen={() => setPreviewing(true)}
            onLoad={(image) => rememberSize(attachment, image)}
          />
        ) : (
          <span
            role="img"
            aria-label={name}
            style={placeholder}
            className={cn(
              "inline-block max-w-full rounded bg-white/10 align-bottom",
              !placeholder?.aspectRatio && "h-32",
              !placeholder && "w-48",
            )}
          />
        )
      ) : (
        <button
          type="button"
          contentEditable={false}
          data-rich-text-atom
          title={attachment ? name : undefined}
          aria-label={attachment ? name : "Deleted file"}
          disabled={!attachment}
          onClick={() => {
            if (image) setPreviewing(true);
            else if (attachment) void openAttachment(transfers, attachment);
          }}
          className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-task-panel-ring/30 bg-task-panel-hover/60 px-1.5 py-px align-bottom text-xs font-normal text-content-tinted hover:text-content disabled:cursor-default"
        >
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="h-4 w-4 shrink-0 rounded-sm object-cover"
            />
          ) : image ? (
            <span className="h-4 w-4 shrink-0 rounded-sm bg-white/10" />
          ) : (
            <FileText className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">
            {attachment ? shortFileName(name) : "Deleted file"}
          </span>
          {attachment && (
            <span className="shrink-0 text-[10px] opacity-70">
              {formatFileSize(attachment.size)}
            </span>
          )}
        </button>
      )}
      {previewing && attachment && (
        <AttachmentPreview
          attachment={attachment}
          onClose={() => setPreviewing(false)}
        />
      )}
    </>
  );
}

function AttachmentNodeView({
  node,
  selected,
  editor,
  extension,
  updateAttributes,
}: ReactNodeViewProps) {
  const { compact } = extension.options as AttachmentNodeOptions;
  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "inline-block max-w-full align-bottom rounded",
        selected && "ring-2 ring-accent",
      )}
    >
      <InlineAttachment
        src={node.attrs.src}
        alt={node.attrs.alt}
        width={node.attrs.width}
        compact={compact}
        {...(editor.isEditable && {
          onResize: (width: number | null) => updateAttributes({ width }),
        })}
      />
    </NodeViewWrapper>
  );
}

type AttachmentNodeOptions = {
  compact: boolean;
};

// Only `wbd-attachment:` sources are files of this space; other images
// pasted as HTML are dropped rather than hotlinked.
export const AttachmentNode = Node.create<AttachmentNodeOptions>({
  name: ATTACHMENT_NODE,
  inline: true,
  group: "inline",
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() {
    return { compact: false };
  },
  addAttributes() {
    // The order matches the converter in apps/slices common/richText.ts.
    return {
      src: { default: null },
      alt: { default: null },
      width: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("width")) || null,
      },
    };
  },
  parseHTML() {
    return [{ tag: `img[src^="${ATTACHMENT_URL_PREFIX}"]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView, { as: "span" });
  },
});

const filesOf = (data: DataTransfer | null) =>
  data ? Array.from(data.files) : [];

// Pasted and dropped files become attachments of the item and appear where
// they were put.
export const AttachmentPaste = Extension.create<{
  attachFiles: AttachFiles | undefined;
}>({
  name: "attachmentPaste",
  priority: 1000,
  addOptions() {
    return { attachFiles: undefined };
  },
  addProseMirrorPlugins() {
    const { attachFiles } = this.options;
    if (!attachFiles) return [];
    return [
      pendingInsertsPlugin,
      new Plugin({
        key: new PluginKey("attachmentPaste"),
        props: {
          handlePaste: (view, event) => {
            const files = pastedFiles(event.clipboardData);
            if (files.length === 0) return false;
            event.preventDefault();
            const { from, to } = view.state.selection;
            attachAt(view, attachFiles, files, { from, to });
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            const files = filesOf(event.dataTransfer);
            if (moved || files.length === 0) return false;
            event.preventDefault();
            const pos =
              view.posAtCoords({ left: event.clientX, top: event.clientY })
                ?.pos ?? view.state.selection.from;
            attachAt(view, attachFiles, files, { from: pos, to: pos });
            return true;
          },
        },
      }),
    ];
  },
});
