export const isObjectType =
    <T>(type: string) =>
        (p: unknown): p is T => {
            return typeof p == "object" && p !== null && "type" in p && p.type === type;
        };