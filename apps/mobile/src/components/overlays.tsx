import { useEffect, useState, type ComponentType } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "./Text";
import { cx } from "@/lib/cx";

// Imperative prompt and action sheet, mirroring the web prompt-dialog service.
// A single host at the app root renders whichever overlay is open.

type PromptRequest = {
  kind: "prompt";
  title: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
};

export type SheetAction = {
  label: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  destructive?: boolean;
  onPress: () => void;
};

type SheetRequest = { kind: "sheet"; title?: string; actions: SheetAction[] };

type OverlayRequest = PromptRequest | SheetRequest;

let current: OverlayRequest | null = null;
const listeners = new Set<() => void>();
const setCurrent = (next: OverlayRequest | null) => {
  current = next;
  for (const listener of listeners) listener();
};

export const promptDialog = (title: string, defaultValue = "") =>
  new Promise<string | null>((resolve) => {
    if (current?.kind === "prompt") current.resolve(null);
    setCurrent({ kind: "prompt", title, defaultValue, resolve });
  });

export const showActionSheet = (sheet: Omit<SheetRequest, "kind">) =>
  setCurrent({ kind: "sheet", ...sheet });

function useOverlay() {
  const [overlay, setOverlay] = useState(current);
  useEffect(() => {
    const listener = () => setOverlay(current);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return overlay;
}

export function OverlayHost() {
  const overlay = useOverlay();
  if (overlay?.kind === "prompt") {
    return <PromptModal key={overlay.title} request={overlay} />;
  }
  if (overlay?.kind === "sheet") {
    return <ActionSheetModal request={overlay} />;
  }
  return null;
}

function PromptModal({ request }: { request: PromptRequest }) {
  const [value, setValue] = useState(request.defaultValue);
  const close = (result: string | null) => {
    setCurrent(null);
    request.resolve(result);
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={() => close(null)}>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1 items-center justify-center bg-black/60 px-6"
      >
        <Pressable className="absolute inset-0" onPress={() => close(null)} />
        <View className="w-full max-w-sm gap-5 rounded-lg bg-dialog-bg p-6 border border-dialog-border">
          <Text className="text-[15px] font-inter-semibold text-content">
            {request.title}
          </Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            onSubmitEditing={() => close(value)}
            returnKeyType="done"
            selectionColor="#3b82f6"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-content"
          />
          <View className="flex-row justify-end gap-2">
            <Pressable
              onPress={() => close(null)}
              className="rounded-md px-3.5 py-1.5 active:bg-white/5"
            >
              <Text className="text-[13px] font-inter-medium text-content-tinted">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => close(value)}
              className="rounded-md bg-accent px-3.5 py-1.5 active:opacity-85"
            >
              <Text className="text-[13px] font-inter-semibold text-white">
                OK
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ActionSheetModal({ request }: { request: SheetRequest }) {
  const insets = useSafeAreaInsets();
  const close = () => setCurrent(null);

  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={close}>
        <Pressable
          className="mx-3 rounded-xl bg-[#15151f] p-1.5 border border-white/10"
          style={{ marginBottom: insets.bottom + 12 }}
        >
          {request.title && (
            <Text
              numberOfLines={1}
              className="px-3 pb-1.5 pt-2 text-xs font-inter-semibold uppercase text-content-secondary"
            >
              {request.title}
            </Text>
          )}
          {request.actions.map(
            ({ label, icon: Icon, destructive, onPress }) => (
              <Pressable
                key={label}
                onPress={() => {
                  close();
                  onPress();
                }}
                className="min-h-11 flex-row items-center gap-3 rounded-lg px-3 active:bg-white/10"
              >
                {Icon && (
                  <Icon size={16} color={destructive ? "#f87171" : "#94a3b8"} />
                )}
                <Text
                  className={cx(
                    "text-sm",
                    destructive ? "text-red-400" : "text-slate-100",
                  )}
                >
                  {label}
                </Text>
              </Pressable>
            ),
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
