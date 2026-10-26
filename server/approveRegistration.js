import { lockRegistrationOwner, checkRequestRevision, validatePetRegistration, registrationAudit, registrationError } from './petRegistration.js';

// The caller owns the transaction. Both registration-only review and visit approval
// reuse this operation so patient IDs, card references and protocol seeds stay stable.
export async function approveRegistration(client, reqId, user, revision) {
  const actorName = user.name;
  const today = new Date().toISOString().slice(0, 10);
  let cardId = "VACC-" + crypto.randomUUID();
  let newPetId = "p_" + crypto.randomUUID();
  const ownerId = (await client.query("SELECT owner_id FROM pet_requests WHERE id = $1",[reqId])).rows[0]?.owner_id;
  await lockRegistrationOwner(client,ownerId);
  const qReq = await client.query("SELECT * FROM pet_requests WHERE id = $1 FOR UPDATE", [reqId]);
  if (!qReq.rows.length) throw registrationError("Pet request not found.",404);
  const r = qReq.rows[0];
  if (r.status !== "Pending") throw Object.assign(new Error("This request has already been processed."), { status: 409 });
  checkRequestRevision(r,revision);
  validatePetRegistration({ ...r, weight:Number(r.weight), speciesOther:r.species_other, dentalOcclusion:r.dental_occlusion,priorVaccines:r.prior_vaccines || [],externalClinicNotes:r.external_clinic_notes || '' });

  // Preserve the patient identity already used by pending appointment requests.
  if(r.pet_id) {
    newPetId=r.pet_id;
    const verified=await client.query("UPDATE pets SET registration_status='Verified',vaccination_card_id=COALESCE(NULLIF(vaccination_card_id,''),$2) WHERE id=$1 AND owner_id=$3 AND registration_status='Pending' RETURNING id,vaccination_card_id",[newPetId,cardId,r.owner_id]);
    if(!verified.rows.length) throw registrationError('The pending patient changed. Refresh before approving.',409);
    cardId=verified.rows[0].vaccination_card_id || cardId;
  } else await client.query(
    `INSERT INTO pets (id, owner_id, name, species, species_other, breed, sex, birth, weight, color, neutered, vaccination_card_id, notes, photo, dental_occlusion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [newPetId, r.owner_id, r.name, r.species, r.species_other || "", r.breed || "Mixed Breed", r.sex, r.birth, r.weight, r.color || "", r.neutered || "Not sure", cardId, r.notes || "", r.photo || "", r.dental_occlusion || ""]
  );

  await client.query('UPDATE pets SET prior_vaccines=$2,external_clinic_notes=$3 WHERE id=$1',[newPetId,JSON.stringify(r.prior_vaccines || []),r.external_clinic_notes || '']);

  // 2. Insert weight baseline
  await client.query(
    `INSERT INTO pet_weights (pet_id, date, kg, recorded_by,origin) VALUES ($1, $2, $3, $4,'registration')`,
    [newPetId, today, r.weight, "registration"]
  );

  // 3. Automated Digital Card Vaccine Protocol Seeds (Core schedules per VCMS v2.0 & Life Stage)
  const sp = (r.species || "").toLowerCase();
  const isDog = sp.includes("dog") || sp.includes("canine");
  const isCat = sp.includes("cat") || sp.includes("feline");
  const isRabbit = sp.includes("rabbit") || sp.includes("lagomorph");
  const isRodent = sp.includes("rodent") || sp.includes("hamster") || sp.includes("guinea");
  const isAvian = sp.includes("bird") || sp.includes("avian");
  const addDays = (dStr, days) => {
    const d = new Date(dStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  let isAdult = false;
  if (r.birth) {
    const b = new Date(r.birth);
    const now = new Date(today);
    const diffDays = Math.floor((now - b) / (1000 * 60 * 60 * 24));
    if (diffDays >= 365) isAdult = true;
  }

  const seeded = [];
  if (isDog) {
    if (isAdult) {
      // Lifelong Adult Canine Maintenance Schedule (1 Year and Beyond)
      const v1 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "DHPP (5-in-1 Adult Core Booster)",
        brand: "Nobivac DHPP",
        batch: "AUTO-DHPP-ADULT",
        date: today,
        next_due: addDays(today, 365),
        dose_no: 1,
        dose_of: 1,
        done: false,
        automated: true,
        protocol_type: "Adult Core Immunization (Annual)",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v1)
      );
      seeded.push(v1);

      const v2 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Anti-Rabies Booster (RA 9482 Compliance)",
        brand: "Defensor 3",
        batch: "AUTO-RAB-ADULT",
        date: today,
        next_due: addDays(today, 365),
        dose_no: 1,
        dose_of: 1,
        done: false,
        automated: true,
        protocol_type: "Core Rabies Protocol (Annual Mandatory)",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v2)
      );
      seeded.push(v2);

      const v3 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Adult Deworming (Quarterly Routine)",
        brand: "Canex Multi-Spectrum",
        batch: "AUTO-DEW-ADULT",
        date: today,
        next_due: addDays(today, 90),
        dose_no: 1,
        dose_of: 4,
        done: false,
        automated: true,
        protocol_type: "Adult Parasiticide Protocol (Quarterly)",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v3)
      );
      seeded.push(v3);

      const v4 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Monthly Flea, Tick & Heartworm Chewable",
        brand: "NexGard Spectra / Simparica Trio",
        batch: "AUTO-ECTO-M",
        date: today,
        next_due: addDays(today, 30),
        dose_no: 1,
        dose_of: 12,
        done: false,
        automated: true,
        protocol_type: "Monthly Prophylaxis Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v4)
      );
      seeded.push(v4);
    } else {
      // Puppy series (< 12 months)
      const v1 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "DHPP (5-in-1 Core)",
        brand: "Nobivac DHPP",
        batch: "AUTO-DHPP-01",
        date: today,
        next_due: addDays(today, 21),
        dose_no: 1,
        dose_of: 3,
        done: false,
        automated: true,
        protocol_type: "Core Canine Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v1)
      );
      seeded.push(v1);

      const v2 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Anti-Rabies (1-Year Core)",
        brand: "Defensor 3",
        batch: "AUTO-RAB-01",
        date: today,
        next_due: addDays(today, 30),
        dose_no: 1,
        dose_of: 1,
        done: false,
        automated: true,
        protocol_type: "Core Rabies Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v2)
      );
      seeded.push(v2);

      const v3 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Broad-Spectrum Deworming",
        brand: "Canex Multi-Spectrum",
        batch: "AUTO-DEW-01",
        date: today,
        next_due: addDays(today, 14),
        dose_no: 1,
        dose_of: 4,
        done: false,
        automated: true,
        protocol_type: "Parasiticide Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v3)
      );
      seeded.push(v3);
    }
  } else if (isCat) {
    if (isAdult) {
      const v1 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "FVRCP (4-in-1 Adult Core Booster)",
        brand: "Fel-O-Vax 4",
        batch: "AUTO-FVR-ADULT",
        date: today,
        next_due: addDays(today, 365),
        dose_no: 1,
        dose_of: 1,
        done: false,
        automated: true,
        protocol_type: "Adult Core Feline Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v1)
      );
      seeded.push(v1);

      const v2 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Anti-Rabies Booster (Feline Formulation)",
        brand: "Defensor 3",
        batch: "AUTO-RABF-ADULT",
        date: today,
        next_due: addDays(today, 365),
        dose_no: 1,
        dose_of: 1,
        done: false,
        automated: true,
        protocol_type: "Core Rabies Protocol (Annual)",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v2)
      );
      seeded.push(v2);

      const v3 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Adult Feline Deworming (Quarterly)",
        brand: "Profender / Milbemax",
        batch: "AUTO-DEWF-ADULT",
        date: today,
        next_due: addDays(today, 90),
        dose_no: 1,
        dose_of: 4,
        done: false,
        automated: true,
        protocol_type: "Feline Parasiticide Protocol (Quarterly)",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v3)
      );
      seeded.push(v3);
    } else {
      const v1 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "FVRCP (4-in-1 Core)",
        brand: "Fel-O-Vax 4",
        batch: "AUTO-FVR-01",
        date: today,
        next_due: addDays(today, 28),
        dose_no: 1,
        dose_of: 3,
        done: false,
        automated: true,
        protocol_type: "Core Feline Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v1)
      );
      seeded.push(v1);

      const v2 = {
        id: "v_" + Math.random().toString(36).slice(2, 8),
        pet_id: newPetId,
        card_id: cardId,
        vaccine: "Anti-Rabies (Feline Formulation)",
        brand: "Defensor 3",
        batch: "AUTO-RABF-01",
        date: today,
        next_due: addDays(today, 30),
        dose_no: 1,
        dose_of: 1,
        done: false,
        automated: true,
        protocol_type: "Core Rabies Protocol",
        recorded_by: actorName || "Vet Assistant"
      };
      await client.query(
        `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        Object.values(v2)
      );
      seeded.push(v2);
    }
  } else if (isRabbit) {
    const v1 = {
      id: "v_" + Math.random().toString(36).slice(2, 8),
      pet_id: newPetId,
      card_id: cardId,
      vaccine: "RHDV1 / RHDV2 Core Vaccine",
      brand: "Filavac VHD",
      batch: "AUTO-RHD-01",
      date: today,
      next_due: addDays(today, 30),
      dose_no: 1,
      dose_of: 1,
      done: false,
      automated: true,
      protocol_type: "Core Lagomorph Protocol",
      recorded_by: actorName || "Vet Assistant"
    };
    await client.query(
      `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      Object.values(v1)
    );
    seeded.push(v1);
  } else if (isRodent) {
    const v1 = {
      id: "v_" + Math.random().toString(36).slice(2, 8),
      pet_id: newPetId,
      card_id: cardId,
      vaccine: "Dental & Occlusion Clinical Exam",
      brand: "VCMS Protocol",
      batch: "AUTO-DEN-01",
      date: today,
      next_due: addDays(today, 180),
      dose_no: 1,
      dose_of: 2,
      done: false,
      automated: true,
      protocol_type: "Rodent Dental Protocol",
      recorded_by: actorName || "Vet Assistant"
    };
    await client.query(
      `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      Object.values(v1)
    );
    seeded.push(v1);
  } else if (isAvian) {
    const v1 = {
      id: "v_" + Math.random().toString(36).slice(2, 8),
      pet_id: newPetId,
      card_id: cardId,
      vaccine: "Diagnostic Fecal Float Screening",
      brand: "Microscopic Screen",
      batch: "AUTO-FLT-01",
      date: today,
      next_due: addDays(today, 180),
      dose_no: 1,
      dose_of: 1,
      done: false,
      automated: true,
      protocol_type: "Avian Diagnostic Protocol",
      recorded_by: actorName || "Vet Assistant"
    };
    await client.query(
      `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      Object.values(v1)
    );
    seeded.push(v1);
  }

  // 4. Update pet_request record
  const upd = await client.query(
    `UPDATE pet_requests
     SET status = 'Approved', approved_at = CURRENT_DATE, approved_by = $1, reviewed_at = clock_timestamp(), approved_by_user_id = $5, pet_id = $2, card_id = $3, revision = revision + 1
     WHERE id = $4
     RETURNING *`,
    [actorName, newPetId, cardId, reqId, user.id]
  );

  // Registration approval does not reserve clinical time or choose a doctor.
  const preAppt = null;

  await registrationAudit(client,user,`Approved pet request ${reqId} for ${r.name} (Assigned Card ${cardId})`);
  const qPet = await client.query("SELECT * FROM pets WHERE id = $1", [newPetId]);
  return { petId: newPetId, cardId, request: upd.rows[0], pet: qPet.rows[0], vaccs: seeded, appointment: preAppt };
}
