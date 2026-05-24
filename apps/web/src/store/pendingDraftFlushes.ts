type DraftFlusher = () => void;

const draftFlushers = new Set<DraftFlusher>();

export const registerPendingDraftFlush = (flush: DraftFlusher) => {
  draftFlushers.add(flush);

  return () => {
    draftFlushers.delete(flush);
  };
};

export const flushPendingDrafts = () => {
  for (const flush of [...draftFlushers]) {
    flush();
  }
};
