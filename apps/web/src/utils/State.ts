export class State<T> {
  static UNKNOWN = Symbol("Unknwon state");

  private value: T;

  // Map is used to handle case when emitImmediately===true and we immediately unsub
  subs = new Map<(val: T, unsub: () => void) => void, (val: T) => void>();

  constructor(val: T) {
    this.value = val;
  }

  set(value: T) {
    this.value = value;
    for (const s of this.subs.values()) {
      s(value);
    }
  }

  modify(modifier: (value: T) => T) {
    this.set(modifier(this.get()));
  }

  get() {
    return this.value;
  }

  getOrThrow(): Exclude<T, null | undefined> {
    if (this.value === null || this.value === undefined)
      throw new Error("State is null or undefined");

    return this.value as Exclude<T, null | undefined>;
  }

  async whenAndGet<K extends T>(
    func: (value: T) => K | typeof State.UNKNOWN,
  ): Promise<K> {
    await this.when((v) => func(v) !== State.UNKNOWN);

    const res = func(this.value);

    if (res === State.UNKNOWN) {
      return this.whenAndGet(func);
    } else {
      return res as K;
    }
  }

  subscribe(
    call: (value: T, unsub: () => void) => void,
    emitImmediately = false,
  ) {
    const unsub = () => {
      this.subs.delete(call);
    };

    this.subs.set(call, (value) => {
      call(value, unsub);
    });

    if (emitImmediately) {
      call(this.value, unsub);
    }

    return unsub;
  }

  subscribeOnce(call: (value: T) => void) {
    this.subscribe((value, unsub) => {
      call(value);
      unsub();
    });
  }

  async newEmitted() {
    return new Promise<T>((resolve) => {
      this.subscribeOnce(resolve);
    });
  }

  async when(func: (value: T) => boolean) {
    return new Promise<void>((resolve, reject) => {
      this.subscribe((val, unsub) => {
        const res = func(val);

        if (typeof res !== "boolean") {
          reject(new Error("when result is not boolean"));
          unsub();
          return;
        }

        if (func(val) === true) {
          resolve();
          unsub();
        }
      }, true);
    });
  }
}
