import {cardCareDue} from '../src/vetCardTimeline.js';
import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';

// Brand colours match the on-screen booklet (navy and gold).
const NAVY = '#0f2a5c', BLUE = '#1e40af', GOLD = '#eeb94d', INK = '#1e293b', MUTED = '#64748b', LINE = '#cbd5e1', PANEL = '#f1f6fd', ZEBRA = '#f8fafc';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = value => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || ''); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (value || 'Not recorded'); };
const manilaToday = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Manila'}).format(new Date());
const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
function ageText(birth, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return '';
  let months = (Number(today.slice(0, 4)) - Number(birth.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(birth.slice(5, 7));
  if (Number(today.slice(8, 10)) < Number(birth.slice(8, 10))) months--;
  if (months < 0) return '';
  const years = Math.floor(months / 12), rest = months % 12;
  return years ? `${years} yr${years > 1 ? 's' : ''}${rest ? ` ${rest} mo` : ''}` : `${rest} mo`;
}

export async function vetCardPdf(document, {clinic = null, photo = ''} = {}) {
  const {snapshot} = document, pet = snapshot.pet, owner = snapshot.owner || {}, today = manilaToday();
  const pdf = new PDFDocument({size: 'A4', margin: 40, bufferPages: true, info: {Title: `Vaccination Card - ${pet.name}`, Subject: 'Veterinary vaccination card', Author: clinic?.name || 'PawCare Veterinary Clinic'}});
  const chunks = [];
  const finished = new Promise((resolve, reject) => { pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
  const FONT = fileURLToPath(new URL('./assets/DejaVuSans.ttf', import.meta.url));
  pdf.font(FONT);
  const W = pdf.page.width, M = 40, CW = W - M * 2, FOOT = 52;
  const limit = () => pdf.page.height - FOOT - 6;
  // DejaVu has no bold weight here; a light stroke gives headings the same emphasis.
  const bold = (text, x, y, {fontSize = 10, color = INK, ...options} = {}) => { pdf.save().fontSize(fontSize).lineWidth(fontSize > 15 ? .5 : .3).strokeColor(color).fillColor(color).text(text, x, y, {...options, fill: true, stroke: true}).restore(); };
  const paw = (cx, cy, size, color) => {
    pdf.save().fillColor(color);
    pdf.ellipse(cx, cy + size * .28, size * .5, size * .4).fill();
    for (const [dx, dy] of [[-.62, -.12], [-.22, -.52], [.22, -.52], [.62, -.12]]) pdf.ellipse(cx + dx * size, cy + dy * size, size * .2, size * .27).fill();
    pdf.restore();
  };
  const pill = (text, x, y, fg, bg) => {
    pdf.fontSize(7.5); const w = pdf.widthOfString(text) + 14;
    pdf.roundedRect(x, y, w, 15, 7.5).fill(bg); pdf.fillColor(fg).text(text, x + 7, y + 4, {lineBreak: false}); return w;
  };

  // ---- Page furniture -------------------------------------------------------------------
  const banner = first => {
    const height = first ? 104 : 38;
    const gradient = pdf.linearGradient(0, 0, W, 0); gradient.stop(0, NAVY).stop(1, '#1d4ed8');
    pdf.rect(0, 0, W, height).fill(gradient);
    pdf.rect(0, height, W, 3).fill(GOLD);
    if (first) {
      pdf.save().fillOpacity(.14).circle(M + 24, 52, 24).fill('#ffffff').restore();
      paw(M + 24, 52, 11, GOLD);
      pdf.fontSize(8).fillColor(GOLD).text('OFFICIAL VACCINATION CARD', M + 62, 26, {characterSpacing: 1.6, lineBreak: false});
      bold(clinic?.name || 'PawCare Veterinary Clinic', M + 62, 40, {fontSize: 19, color: '#ffffff', lineBreak: false});
      pdf.fontSize(8).fillColor('#c7d6f5').text('Immunization, deworming and weight record', M + 62, 66, {lineBreak: false});
      pdf.fontSize(7.5).fillColor('#c7d6f5').text(`Card ${document.reference || ''}`, M, 30, {width: CW, align: 'right', lineBreak: false});
      pdf.fillColor(GOLD).text(`Revision ${document.revision ?? 1}`, M, 42, {width: CW, align: 'right', lineBreak: false});
      pdf.fillColor('#c7d6f5').text(`Printed ${nice(today)}`, M, 54, {width: CW, align: 'right', lineBreak: false});
      pdf.y = height + 14;
    } else {
      paw(M + 10, 19, 5, GOLD);
      pdf.fontSize(9).fillColor('#ffffff').text(`${pet.name} · Vaccination card`, M + 26, 14, {lineBreak: false});
      pdf.y = height + 14;
    }
  };
  const ensure = need => { if (pdf.y + need > limit()) { pdf.addPage(); banner(false); return true; } return false; };
  const sectionTitle = (title, note) => {
    ensure(46);
    const y = pdf.y;
    pdf.rect(M, y, 4, 16).fill(GOLD);
    bold(title, M + 11, y + 2, {fontSize: 11.5, color: NAVY, lineBreak: false});
    if (note) pdf.fontSize(8).fillColor(MUTED).text(note, M, y + 4, {width: CW, align: 'right', lineBreak: false});
    pdf.moveTo(M, y + 21).lineTo(M + CW, y + 21).lineWidth(.6).strokeColor(LINE).stroke();
    pdf.y = y + 28;
  };

  banner(true);
  if (clinic) {
    pdf.fontSize(8).fillColor(MUTED).text([clinic.address, clinic.phone, clinic.email, clinic.registration && `Reg. ${clinic.registration}`].filter(Boolean).join('  ·  '), M, pdf.y, {width: CW, align: 'center'});
    pdf.moveDown(.8);
  }

  // ---- Patient and owner ----------------------------------------------------------------
  const top = pdf.y, boxH = 118;
  pdf.roundedRect(M, top, CW, boxH, 10).fill(PANEL);
  pdf.roundedRect(M, top, CW, boxH, 10).lineWidth(.8).strokeColor('#bcd0ee').stroke();
  const frame = {x: M + 14, y: top + 14, size: 90};
  let shown = false;
  if (photo && /^data:image\/(png|jpe?g);base64,/i.test(photo)) {
    try {
      pdf.save().roundedRect(frame.x, frame.y, frame.size, frame.size, 12).clip();
      pdf.image(Buffer.from(photo.split(',')[1], 'base64'), frame.x, frame.y, {cover: [frame.size, frame.size], align: 'center', valign: 'center'});
      pdf.restore(); shown = true;
    } catch { pdf.restore(); }
  }
  if (!shown) {
    pdf.roundedRect(frame.x, frame.y, frame.size, frame.size, 12).fill('#dbe7fb');
    paw(frame.x + frame.size / 2, frame.y + frame.size / 2, 22, '#7f9fd8');
  }
  pdf.roundedRect(frame.x, frame.y, frame.size, frame.size, 12).lineWidth(1.4).strokeColor(GOLD).stroke();
  const tx = frame.x + frame.size + 18, tw = CW - (tx - M) - 14;
  bold(pet.name, tx, top + 14, {fontSize: 20, color: NAVY, width: tw, lineBreak: false, ellipsis: true});
  pdf.fontSize(9).fillColor(MUTED).text(`${pet.speciesOther || pet.species || ''}${pet.breed ? ` · ${pet.breed}` : ''}`, tx, top + 40, {width: tw, lineBreak: false, ellipsis: true});
  const latestWeight = snapshot.events.find(e => e.kind === 'weight');
  const facts = [['Sex', pet.sex], ['Date of birth', pet.birth ? `${nice(pet.birth)}${ageText(pet.birth, today) ? ` (${ageText(pet.birth, today)})` : ''}` : ''], ['Spayed / neutered', pet.neutered],
    ['Colour / markings', pet.color], ['Microchip', pet.microchipNumber], ['Latest weight', latestWeight ? `${latestWeight.value} kg` : '']];
  facts.forEach(([label, value], i) => {
    const x = tx + (i % 2) * (tw / 2), y = top + 58 + Math.floor(i / 2) * 20;
    pdf.fontSize(6.8).fillColor(MUTED).text(label.toUpperCase(), x, y, {width: tw / 2 - 8, lineBreak: false, characterSpacing: .4});
    pdf.fontSize(8.6).fillColor(INK).text(value || 'Not recorded', x, y + 8, {width: tw / 2 - 8, lineBreak: false, ellipsis: true});
  });
  pdf.y = top + boxH + 12;

  const oTop = pdf.y;
  pdf.roundedRect(M, oTop, CW, 58, 8).lineWidth(.8).strokeColor(LINE).stroke();
  pdf.fontSize(6.8).fillColor(MUTED).text('OWNER', M + 14, oTop + 8, {characterSpacing: .6, lineBreak: false});
  bold(owner.name || 'Not recorded', M + 14, oTop + 19, {fontSize: 10.5, color: NAVY, width: CW / 2 - 20, lineBreak: false, ellipsis: true});
  pdf.fontSize(8.2).fillColor(INK).text(owner.address || 'Address not recorded', M + 14, oTop + 36, {width: CW / 2 - 20, height: 20, ellipsis: true});
  pdf.fontSize(6.8).fillColor(MUTED).text('CONTACT', M + CW / 2 + 10, oTop + 8, {characterSpacing: .6, lineBreak: false});
  pdf.fontSize(8.6).fillColor(INK).text(owner.phone || 'Phone not recorded', M + CW / 2 + 10, oTop + 20, {width: CW / 2 - 24, lineBreak: false, ellipsis: true});
  pdf.text(owner.email || 'Email not recorded', M + CW / 2 + 10, oTop + 35, {width: CW / 2 - 24, lineBreak: false, ellipsis: true});
  pdf.y = oTop + 72;

  // ---- Next preventive care -------------------------------------------------------------
  const due = cardCareDue(snapshot.events);
  sectionTitle('Next preventive care', 'Vet-approved return dates');
  if (!due.length) {
    pdf.fontSize(9).fillColor(MUTED).text('No next deworming or vaccination date is recorded.', M, pdf.y);
    pdf.moveDown(.8);
  } else {
    due.forEach(event => {
      ensure(38);
      const y = pdf.y, days = dayDiff(today, event.nextDue);
      const tone = days < 0 ? ['#b91c1c', '#fee2e2', `${-days} day${days === -1 ? '' : 's'} overdue`] : days <= 30 ? ['#92400e', '#fef3c7', days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`] : ['#166534', '#dcfce7', `In ${days} days`];
      pdf.roundedRect(M, y, CW, 32, 7).fill('#fffbea');
      pdf.roundedRect(M, y, 4, 32, 2).fill(tone[0]);
      bold(event.vaccine, M + 14, y + 6, {fontSize: 9.5, color: NAVY, width: 250, lineBreak: false, ellipsis: true});
      pdf.fontSize(7.5).fillColor(MUTED).text(event.kind === 'deworming' ? 'Next deworming' : 'Next vaccination', M + 14, y + 19, {lineBreak: false});
      bold(nice(event.nextDue), M + 290, y + 9, {fontSize: 11, color: NAVY, lineBreak: false});
      pill(tone[2], M + CW - 112, y + 9, tone[0], tone[1]);
      pdf.y = y + 38;
    });
    pdf.fontSize(7.5).fillColor(MUTED).text('A due date is the veterinarian’s recommended return date. Please contact the clinic to book your appointment.', M, pdf.y, {width: CW});
    pdf.moveDown(.9);
  }

  // ---- Record tables --------------------------------------------------------------------
  const table = (title, note, columns, rows, empty) => {
    ensure(rows.length ? 110 : 60); // keep the heading with its header row and first record
    sectionTitle(title, note);
    if (!rows.length) { pdf.fontSize(9).fillColor(MUTED).text(empty, M, pdf.y); pdf.moveDown(1); return; }
    const header = () => {
      const y = pdf.y; let x = M;
      pdf.rect(M, y, CW, 20).fill(NAVY);
      columns.forEach(c => { pdf.fontSize(7.2).fillColor('#ffffff').text(c.title.toUpperCase(), x + 6, y + 6.5, {width: c.width - 10, lineBreak: false, characterSpacing: .3}); x += c.width; });
      pdf.y = y + 20;
    };
    ensure(70); header();
    rows.forEach((row, i) => {
      const rowH = 30;
      if (pdf.y + rowH > limit()) { pdf.addPage(); banner(false); header(); }
      const y = pdf.y; let x = M;
      if (i % 2 === 0) pdf.rect(M, y, CW, rowH).fill(ZEBRA);
      columns.forEach(c => {
        const cell = c.cell(row);
        if (c.sign) { pdf.moveTo(x + 6, y + rowH - 9).lineTo(x + c.width - 8, y + rowH - 9).lineWidth(.5).strokeColor('#94a3b8').stroke(); }
        else {
          pdf.fontSize(8).fillColor(c.strong ? NAVY : INK).text(cell[0] || '—', x + 6, y + (cell[1] ? 6 : 10), {width: c.width - 8, lineBreak: false});
          if (cell[1]) pdf.fontSize(6.6).fillColor(MUTED).text(cell[1], x + 6, y + 17, {width: c.width - 8, lineBreak: false});
        }
        x += c.width;
      });
      pdf.moveTo(M, y + rowH).lineTo(M + CW, y + rowH).lineWidth(.4).strokeColor(LINE).stroke();
      pdf.y = y + rowH;
    });
    pdf.moveDown(1.2);
  };
  const vaccinations = snapshot.events.filter(e => e.kind === 'vaccination'), dewormings = snapshot.events.filter(e => e.kind === 'deworming'), weights = snapshot.events.filter(e => e.kind === 'weight');
  table('Vaccinations', `${vaccinations.length} recorded`, [
    {title: 'Date', width: 66, cell: e => [nice(e.date)], strong: true}, {title: 'Vaccine', width: 74, cell: e => [e.vaccine], strong: true},
    {title: 'Brand', width: 80, cell: e => [e.brand, e.manufacturer]}, {title: 'Lot / serial', width: 76, cell: e => [e.batch, e.serialNumber && `Serial ${e.serialNumber}`]},
    {title: 'Next due', width: 66, cell: e => [e.nextDue ? nice(e.nextDue) : '']}, {title: 'Vet', width: 70, cell: e => [e.vetName]}, {title: 'Signature', width: CW - 432, sign: true, cell: () => ['']}],
    vaccinations, 'No vaccinations are recorded yet.');
  table('Deworming', `${dewormings.length} recorded`, [
    {title: 'Date', width: 66, cell: e => [nice(e.date)], strong: true}, {title: 'Treatment', width: 100, cell: e => [e.vaccine], strong: true}, {title: 'Product', width: 100, cell: e => [e.brand, e.batch && `Lot ${e.batch}`]},
    {title: 'Next due', width: 66, cell: e => [e.nextDue ? nice(e.nextDue) : '']}, {title: 'Vet', width: 70, cell: e => [e.vetName]}, {title: 'Signature', width: CW - 402, sign: true, cell: () => ['']}],
    dewormings, 'No deworming is recorded yet.');

  // Weight history with a small trend line when there are enough points.
  sectionTitle('Weight per visit', `${weights.length} measured`);
  if (!weights.length) { pdf.fontSize(9).fillColor(MUTED).text('No clinic-measured weights are recorded yet.', M, pdf.y); pdf.moveDown(1); }
  else {
    const ordered = [...weights].reverse(), chartW = CW, chartH = 70;
    ensure(chartH + 60);
    const y0 = pdf.y, values = ordered.map(w => w.value), lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    pdf.roundedRect(M, y0, chartW, chartH, 8).fill(PANEL);
    if (ordered.length > 1) {
      const px = i => M + 24 + (i / (ordered.length - 1)) * (chartW - 48), py = v => y0 + chartH - 18 - ((v - lo) / span) * (chartH - 38);
      pdf.moveTo(px(0), py(values[0]));
      values.forEach((v, i) => { if (i) pdf.lineTo(px(i), py(v)); });
      pdf.lineWidth(1.6).strokeColor(BLUE).stroke();
      values.forEach((v, i) => { pdf.circle(px(i), py(v), 2.6).fill(GOLD); pdf.fontSize(6.6).fillColor(INK).text(`${v}`, px(i) - 14, py(v) - 11, {width: 28, align: 'center', lineBreak: false}); });
    } else pdf.fontSize(9).fillColor(MUTED).text('A trend line appears after a second measurement.', M, y0 + 28, {width: chartW, align: 'center'});
    pdf.y = y0 + chartH + 8;
    const recent = weights.slice(0, 6);
    let x = M;
    const rowY = pdf.y;
    recent.forEach(w => {
      const label = `${nice(w.date)}  ${w.value} kg`; pdf.fontSize(7.8);
      const width = pdf.widthOfString(label) + 16;
      if (x + width > M + CW) return;
      pill(label, x, rowY, NAVY, '#e5edfb'); x += width + 6;
    });
    pdf.y = rowY + 24;
  }

  // ---- Footer on every page -------------------------------------------------------------
  const pages = pdf.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    pdf.switchToPage(i);
    const bottom = pdf.page.margins.bottom; pdf.page.margins.bottom = 0;
    const y = pdf.page.height - FOOT + 8;
    pdf.moveTo(M, y).lineTo(M + CW, y).lineWidth(1.2).strokeColor(GOLD).stroke();
    pdf.fontSize(7).fillColor(MUTED).text('Official only when signed by the attending veterinarian. Bring this card to every visit.', M, y + 7, {width: CW - 140, lineBreak: false});
    pdf.fontSize(7.5).fillColor(NAVY).text(`${pet.name}  ·  Page ${i + 1} of ${pages.count}`, M, y + 7, {width: CW, align: 'right', lineBreak: false});
    pdf.fontSize(6.8).fillColor(MUTED).text(`${document.reference || ''}${clinic?.name ? `  ·  ${clinic.name}` : ''}`, M, y + 21, {width: CW, lineBreak: false});
    pdf.page.margins.bottom = bottom;
  }
  pdf.end();
  return finished;
}
