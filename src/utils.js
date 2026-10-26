export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export const plus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const uid = () => Math.random().toString(36).slice(2, 9);

export const addLog = (p, me, msg) => [
  { id: uid(), at: new Date().toLocaleString(), by: me.name, msg },
  ...(p.log || []),
].slice(0, 40);

