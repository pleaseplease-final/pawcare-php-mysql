import {money, paymentDate, paymentTime} from "../assistantWorkflow.js";
import {OfficialLetterhead, pesoWords, manilaDateTime} from "./OfficialDocument.jsx";

// Official receipt for a paid visit, shown on screen and printed. One receipt per visit, numbered from the visit.
export const receiptNumber = id => `OR-${String(id ?? "").replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase() || "000000"}`;
export const invoiceNumber = receiptNumber;

const MODES = [["Cash", ["cash"]], ["GCash", ["gcash"]], ["Maya", ["maya"]], ["Card", ["card", "credit card", "debit card", "credit / debit card"]]];
const amountText = value => value === null ? "Not recorded" : value.toLocaleString("en-PH", {minimumFractionDigits: 2, maximumFractionDigits: 2});

export default function InvoiceDocument({appt, payment, bill, pet, owner}) {
  const method = payment.paymentMethod?.trim() || "Not recorded";
  const methodKey = method.toLowerCase();
  const cash = methodKey === "cash";
  const lines = bill.items;
  const tendered = Number(payment.cashTendered);
  const orNo = receiptNumber(appt.id);
  const paidOn = payment.paidAt ? manilaDateTime(payment.paidAt) : "Not recorded";
  const words = bill.amount === null ? "" : pesoWords(bill.amount);
  const known = MODES.some(([, keys]) => keys.includes(methodKey));
  return <article className="inv-doc or-doc" aria-label={`Official receipt ${orNo}`}>
    <OfficialLetterhead screen title="Official Receipt" subtitle="Veterinary services and pet supplies"
      meta={[["O.R. No.", orNo], ["Date", paymentDate(payment.paidAt) || "Not recorded"], ["Time", paymentTime(payment.paidAt)]]} />
    <div className="inv-stamp" aria-hidden="true">PAID</div>

    <p className="or-received">
      <span>Received from</span> <b className="or-fill">{owner.name || "Walk-in client"}</b>
      {owner.address && <><span>, with address at</span> <b className="or-fill">{owner.address}</b></>}
      <span>, the sum of</span> <b className="or-fill or-words">{words || "amount not recorded"}</b>
      <span>(₱</span><b className="or-fill">{amountText(bill.amount)}</b><span>) in full payment for the services and items listed below.</span>
    </p>

    <dl className="or-details">
      <div><dt>Patient</dt><dd>{pet.name || "Pet"}{[pet.species, pet.breed].filter(Boolean).length ? ` (${[pet.species, pet.breed].filter(Boolean).join(", ")})` : ""}</dd></div>
      <div><dt>Visit</dt><dd>{appt.date}{appt.time ? ` · ${appt.time}` : ""}{appt.reason ? ` · ${appt.reason}` : ""}</dd></div>
      <div><dt>Contact</dt><dd>{[owner.phone, owner.email].filter(Boolean).join(" · ") || "Not on file"}</dd></div>
      <div><dt>Visit reference</dt><dd className="or-mono">{appt.id}</dd></div>
    </dl>

    <table className="inv-items">
      <thead><tr><th className="num">#</th><th>Particulars</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {lines.length === 0 && <tr><td colSpan="5" className="inv-none">Itemized charges were not recorded for this visit.</td></tr>}
        {lines.map((it, i) => <tr key={i}>
          <td className="num">{i + 1}</td>
          <td>{it.name}{it.source === "admission" && <small> (clinic use)</small>}{it.category && <small className="inv-cat">{it.category}</small>}</td>
          <td className="num">{it.qty}</td>
          <td className="num">{amountText(it.price)}</td>
          <td className="num">{amountText(it.price * it.qty)}</td>
        </tr>)}
      </tbody>
    </table>

    <div className="or-bottom">
      <fieldset className="or-modes">
        <legend>Form of payment</legend>
        {MODES.map(([label, keys]) => <span key={label} className="or-mode"><span className="or-box" aria-hidden="true">{keys.includes(methodKey) ? "✓" : ""}</span>{label}</span>)}
        {!known && <span className="or-mode"><span className="or-box" aria-hidden="true">✓</span>{method}</span>}
        {!cash && payment.paymentReference && <span className="or-ref">Reference / Approval No.: <b className="inv-ref">{payment.paymentReference}</b></span>}
      </fieldset>
      <div className="inv-totals">
        {bill.subtotal !== null && <div><span>Total sales</span><b>{money(bill.subtotal)}</b></div>}
        {bill.discount > 0 && <div className="inv-discount"><span>Less: discount</span><b>-{money(bill.discount)}</b></div>}
        <div className="inv-grand"><span>Total amount paid</span><b>{money(bill.amount)}</b></div>
        {cash && Number.isFinite(tendered) && tendered > 0 && <>
          <div><span>Cash tendered</span><b>{money(tendered)}</b></div>
          <div><span>Change</span><b>{money(Number(payment.changeAmount) || 0)}</b></div>
        </>}
      </div>
    </div>

    {bill.mismatch && <p role="status" className="inv-note">Saved itemization differs from the recorded payment. The payment amount above is preserved.</p>}

    <div className="or-sign">
      <div>
        <span className="os-line">{payment.receivedBy || " "}</span>
        <span className="os-caption">Cashier / Authorized representative</span>
      </div>
    </div>
    <footer className="inv-foot">
      Payment received {paidOn}. Keep this official receipt for your records; it is the clinic’s proof of payment for the visit stated above.
      <br />Thank you for trusting us with your pet’s care.
    </footer>
  </article>;
}
