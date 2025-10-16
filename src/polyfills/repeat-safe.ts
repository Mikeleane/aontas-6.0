/* Safe clamp for String.prototype.repeat */
(() => {
  const g: any = (globalThis as any);
  if (g.__repeatSafePatched) return;
  g.__repeatSafePatched = true;

  const orig = String.prototype.repeat;
  String.prototype.repeat = function(count: any): string {
    const n = Number(count);
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    return orig.call(this, safe);
  };
})();
