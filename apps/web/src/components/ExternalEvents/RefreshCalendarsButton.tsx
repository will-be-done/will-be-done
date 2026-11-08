import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAsyncSelector, useDB } from "@will-be-done/hyperdb/react";
import { hasExternalCalendars } from "@will-be-done/slices/space";
import { useOnline } from "@/hooks/useOnline";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { syncByDB } from "@/store/syncStatus";

export function RefreshCalendarsButton({
  spaceId,
  className,
}: {
  spaceId: string;
  className?: string;
}) {
  const db = useDB();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const online = useOnline();
  const { data: connected = false } = useAsyncSelector({
    selector: hasExternalCalendars,
    args: {},
  });
  const refresh = useMutation({
    mutationFn: async () => {
      const { failed } = await trpcClient.calendars.refreshSpace
        .mutate({ spaceId })
        .catch((error: Error) => {
          toast.error("Couldn't refresh calendars", {
            description: error.message,
          });
          throw error;
        })
        .finally(() =>
          queryClient.invalidateQueries({
            queryKey: trpc.calendars.list.queryKey({ spaceId }),
          }),
        );
      const [first] = failed;
      if (failed.length === 1 && first) {
        toast.error(`Couldn't refresh ${first.name}`, {
          description: first.error,
        });
      } else if (failed.length > 1) {
        toast.error(`Couldn't refresh ${failed.length} calendars`, {
          description: (
            <ul>
              {failed.map((f) => (
                <li key={f.id}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          ),
        });
      }

      const sync = syncByDB.get(db);
      if (!sync) return;
      await sync.syncNow().then(
        () => toast.success("Sync done"),
        (error: Error) =>
          toast.error("Couldn't sync", { description: error.message }),
      );
    },
  });

  if (!connected) return null;

  const label = online ? "Refresh calendars" : "Can't refresh while offline";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!online || refresh.isPending}
      onClick={() => refresh.mutate()}
      className={cn(
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-4 w-4", refresh.isPending && "animate-spin")}
      />
    </button>
  );
}
