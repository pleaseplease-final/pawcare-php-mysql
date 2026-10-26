import '../services-prices.css';
import { PaginatedList } from "../../components/Pagination.jsx";
import { useEffect, useState } from "react";
import { api } from "../../api.js";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const isProduct = item => item.id.startsWith("product_") || item.requiresPrescription;

export default function Prices({ go, staff=false }) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    api.get("/api/services/prices").then(r => {
      if (active) setCatalog(r.catalog);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);

  const items = (catalog || []).filter(p => type === "all" || (type === "products" ? isProduct(p) : !isProduct(p)));
  const categories = [...new Set(items.map(p => p.category))];
  const query = search.trim().toLowerCase();
  const visible = items.filter(p => (!category || p.category === category) && `${p.name} ${p.category} ${p.desc || ""}`.toLowerCase().includes(query));
  const groups = categories.map(name => [name, visible.filter(p => p.category === name)]).filter(([, rows]) => rows.length);
  const clear = () => { setSearch(""); setType("all"); setCategory(""); };

  return <section className="card ow-prices" aria-labelledby="clinic-prices-title">
    <div className="ow-prices-heading">
      <div><h3 id="clinic-prices-title">Services & Prices</h3><p>Explore the care and products offered by your veterinary clinic.</p></div>
      {go && !staff && <button className="btn" onClick={() => go("appts")}>Book a visit</button>}
    </div>
    <p className="ow-note">Prices are fixed in Philippine pesos (PHP) and match the clinic’s billing catalog. Your final bill depends on the services performed and quantities supplied. Your veterinarian will confirm which care is suitable for your pet.</p>
    <div className="ow-price-types" role="group" aria-label="Browse prices">
      {[["all", "All offers"], ["services", "Veterinary services"], ["products", "Pet products"]].map(([value, label]) => <button key={value} className={`btn sm ${type === value ? "" : "ghost"}`} aria-pressed={type === value} onClick={() => { setType(value); setCategory(""); }}>{label}</button>)}
    </div>
    <div className="ow-price-filters">
      <div><label className="ow-lbl" htmlFor="price-search">Find a vaccine, service or product</label><input id="price-search" type="search" placeholder="Search by name or description" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div><label className="ow-lbl" htmlFor="price-category">Category</label><select id="price-category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select></div>
    </div>
    {error ? <p role="alert">Prices could not be loaded. {error} <button className="btn sm" onClick={() => retry(x => x + 1)}>Retry</button></p>
      : !catalog ? <p role="status">Loading clinic prices…</p>
      : <>
        <p className="ow-price-count" role="status">{visible.length} {visible.length === 1 ? "offer" : "offers"}{search || category || type !== "all" ? " found" : " available"}</p>
        {!catalog.length ? <div className="empty sm">The clinic has not published prices yet. Please contact reception for pricing.</div>
          : !visible.length ? <div className="empty sm"><p>No offers match your search or filters.</p><button className="btn sm ghost" onClick={clear}>Clear filters</button></div>
          : groups.map(([name, rows]) => <section className="ow-price-group" key={name} aria-label={name}>
            <h4>{name}</h4>
            <PaginatedList as="ul" label={`${name} offers`} resetKey={[search,type,category]} className="ow-price-list">{rows.map(p => <li key={p.id}>
              <div className="ow-price-detail"><h5>{p.name}</h5>{p.desc && <p>{p.desc}</p>}{p.requiresPrescription && <span className="ow-price-rx">Veterinarian prescription required</span>}</div>
              <div className="ow-price-amount"><strong>{money.format(p.price)}</strong><small>{isProduct(p) ? `per ${p.unit || "item / package"}` : "per service"}</small></div>
            </li>)}</PaginatedList>
          </section>)}
      </>}
  </section>;
}
