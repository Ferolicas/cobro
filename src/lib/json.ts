export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? Number(item) : item,
    ),
  ) as T;
}

export function jsonResponse(data: unknown, init?: ResponseInit) {
  return Response.json(jsonSafe(data), init);
}

export function jsonValue(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}
