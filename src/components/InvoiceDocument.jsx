import {money, paymentDate, paymentTime} from "../assistantWorkflow.js";

// Paid-invoice document shown on screen and printed. The clinic calls this an invoice, never a receipt.
export const invoiceNumber = id => `INV-${String(id ?? "").replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase() || "000000"}`;

export default function InvoiceDocument({appt, payment, bill, pet, owner}) {
  const method = payment.paymentMethod?.trim() || "Not recorded";
  const cash = method === "Cash";
  const lines = bill.items;
  const tendered = Number(payment.cashTendered);
  return <article className="inv-doc" aria-label={`Paid invoice ${invoiceNumber(appt.id)}`}>
    <header className="inv-head">
      <div>
        <strong className="inv-clinic">PawCare Veterinary Clinic</strong>
        <span className="inv-sub">Official invoice</span>
      </div>
      <div className="inv-title">
        <h2>INVOICE</h2>
        <span className="inv-no">{invoiceNumber(appt.id)}</span>
      </div>
    </header>
    <div className="inv-stamp" aria-hidden="true">PAID</div>

    <dl className="inv-meta">
      <div><dt>Date paid</dt><dd>{paymentDate(payment.paidAt) || "Not recorded"}</dd></div>
      <div><dt>Time</dt><dd>{paymentTime(payment.paidAt) || "Not recorded"}</dd></div>
      <div><dt>Visit</dt><dd>{appt.date}{appt.time ? ` · ${appt.time}` : ""}</dd></div>
      <div><dt>Status</dt><dd><span className="inv-paid">Paid in full</span></dd></div>
    </dl>

    <div className="inv-parties">
      <section>
        <h3>Billed to</h3>
        <p><b>{owner.name || "Owner"}</b></p>
        <p>{owner.phone || "No phone on file"}</p>
        {owner.email && <p>{owner.email}</p>}
      </section>
      <section>
        <h3>Patient</h3>
        <p><b>{pet.name || "Pet"}</b></p>
        <p>{[pet.species, pet.breed].filter(Boolean).join(" · ") || "Species not recorded"}</p>
        {appt.reason && <p>Visit: {appt.reason}</p>}
      </section>
    </div>

    <table className="inv-items">
      <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {lines.length === 0 && <tr><td colSpan="4" className="inv-none">Itemized charges were not recorded for this visit.</td></tr>}
        {lines.map((it, i) => <tr key={i}>
          <td>{it.name}{it.source === "admission" && <small> (clinic use)</small>}{it.category && <small className="inv-cat">{it.category}</small>}</td>
          <td className="num">{it.qty}</td>
          <td className="num">{money(it.price)}</td>
          <td className="num">{money(it.price * it.qty)}</td>
        </tr>)}
      </tbody>
    </table>

    <div className="inv-totals">
      {bill.subtotal !== null && <div><span>Subtotal</span><b>{money(bill.subtotal)}</b></div>}
      {bill.discount > 0 && <div className="inv-discount"><span>Discount (recorded before discounts were removed)</span><b>-{money(bill.discount)}</b></div>}
      <div className="inv-grand"><span>Total paid</span><b>{money(bill.amount)}</b></div>
      <div><span>Payment method</span><b>{method}</b></div>
      {cash && Number.isFinite(tendered) && tendered > 0 && <>
        <div><span>Cash received</span><b>{money(tendered)}</b></div>
        <div><span>Change</span><b>{money(Number(payment.changeAmount) || 0)}</b></div>
      </>}
      {!cash && payment.paymentReference && <div><span>Reference</span><b className="inv-ref">{payment.paymentReference}</b></div>}
    </div>

    {bill.mismatch && <p role="status" className="inv-note">Saved itemization differs from the recorded payment. The payment amount above is preserved.</p>}
    <footer className="inv-foot">Thank you for trusting PawCare with your pet’s care. This invoice is marked paid and is the clinic’s record of your payment.</footer>
  </article>;
}
