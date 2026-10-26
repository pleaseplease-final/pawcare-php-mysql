// Vet Clinic Product Selection Guide.pdf, pp. 1–4. Listed PHP amounts adopted
// as clinic fixed prices by the user's instruction. No package sizes are implied.
const products = [
  ['oatmeal_shampoo', 'Pet shampoo', 'Skin & Allergy Care', 'Itchy, sensitive, or dry skin', 'Oatmeal & Aloe Vera Soothing Shampoo', 350],
  ['medicated_wash', 'Pet shampoo', 'Skin & Allergy Care', 'Bacterial or fungal infection', 'Miconazole + Chlorhexidine Medicated Wash', 650],
  ['neem_soap', 'Pet shampoo', 'Parasite Control', 'Mild flea/tick prevention', 'Neem Oil & Permethrin Soap Bar', 120],
  ['fipronil_shampoo', 'Pet shampoo', 'Parasite Control', 'Severe tick / flea infestation', 'Fipronil-based Medicated Shampoo', 450],
  ['deodorizing_wash', 'Pet shampoo', 'Routine Maintenance', 'Odor control & general cleaning', 'Deodorizing Lavender/Citrus Pet Wash', 280],
  ['baby_shampoo', 'Pet shampoo', 'Routine Maintenance', 'Puppies or kittens under 12 weeks', 'Tearless Baby Pet Shampoo (Gentle Formula)', 300],
  ['whitening_shampoo', 'Pet shampoo', 'Specialty Coat', 'White-coated breeds', 'Whitening & Brightening Shampoo', 380],
  ['multivitamin', 'Pet vitamins', 'Immune Support', 'Post-illness recovery / general daily wellness', 'Complete Multivitamin Syrup (w/ Taurine for Cats)', 250],
  ['vitamin_c', 'Pet vitamins', 'Immune Support', 'Recovery support', 'Vitamin C (Sodium Ascorbate) Tablets/Drops', 180],
  ['omega3', 'Pet vitamins', 'Skin & Coat Health', 'Heavy shedding, dull coat, or flaky skin', 'Omega-3 Fish Oil (EPA/DHA) Liquid/Capsules', 450],
  ['biotin_zinc', 'Pet vitamins', 'Skin & Coat Health', 'Poor nail growth / hair loss', 'Biotin & Zinc Chewable Supplements', 600],
  ['joint_support', 'Pet vitamins', 'Bone & Joint Care', 'Senior pets / arthritis / mobility issues', 'Glucosamine & Chondroitin Tablets', 850],
  ['calcium', 'Pet vitamins', 'Bone & Joint Care', 'Growing large breed puppies', 'Calcium & Phosphorus Powder/Syrup', 320],
  ['probiotic', 'Pet vitamins', 'Digestive Health', 'Diarrhea / post-antibiotic treatment', 'Veterinary Probiotic & Prebiotic Paste', 750],
  ['silymarin', 'Pet vitamins', 'Organ Support', 'Liver support', 'Silymarin (Milk Thistle) Hepatic Support Supplements', 950],
  ['hard_collar', 'Pet accessories', 'Post-Surgery / Recovery', 'Preventing licking of wounds', 'Hard Plastic E-Collar ("Cone of Shame")', 250],
  ['soft_collar', 'Pet accessories', 'Post-Surgery / Recovery', 'Mild scratching / sleeping comfort', 'Inflatable Soft Recovery Collar / Recovery Suit', 650],
  ['nylon_muzzle', 'Pet accessories', 'Restraint & Safety', 'Temporary clinic restraint', 'Nylon Clinic Muzzle (Temporary use only)', 150],
  ['basket_muzzle', 'Pet accessories', 'Restraint & Safety', 'Panting required / public walking safety', 'Basket Muzzle', 450],
  ['slip_leash', 'Pet accessories', 'Walking & Transport', 'General discharge / transfer', 'Standard Slip Leash', 200],
  ['harness', 'Pet accessories', 'Walking & Transport', 'Body restraint', 'Step-in Body Harness', 550],
  ['feeding_syringe', 'Pet accessories', 'Feeding Accessories', 'Assisted feeding', 'Soft-tip Feeding Syringe (10ml - 30ml)', 50],
  ['slow_feeder', 'Pet accessories', 'Feeding Accessories', 'Dogs that eat too fast', 'Slow Feeder Grooved Bowl', 350],
  ['gi_diet', 'Prescription diet', 'Dietary (Gastrointestinal)', 'Gastrointestinal dietary care', 'Gastrointestinal Low-Fat (Wet/Kibble)', 1200],
  ['urinary_diet', 'Prescription diet', 'Dietary (Urinary Tract)', 'Urinary dietary care', 'Urinary S/O Care Diet', 1450],
  ['renal_diet', 'Prescription diet', 'Dietary (Renal)', 'Renal dietary care', 'Renal Support / Low Phosphorus Diet', 1550],
  ['weight_diet', 'Prescription diet', 'Dietary (Weight Management)', 'Weight management', 'Metabolic / Satiety Weight Reduction Kibble', 1350],
  ['recovery_food', 'Prescription diet', 'Dietary (Recovery)', 'Recovery nutrition', 'Recovery / A/D High-Calorie Soft Food', 280],
  ['toothpaste', 'Dental & ear care', 'Dental Care', 'Daily maintenance', 'Enzymatic Pet Toothpaste (Poultry/Beef Flavor)', 450],
  ['dental_chews', 'Dental & ear care', 'Dental Care', 'Pets intolerant to brushing', 'Water Additive Plaque Remover / Dental Chews', 550],
  ['ear_flush', 'Dental & ear care', 'Ear Care', 'Routine cleaning / wax buildup', 'Veterinary Ear Flush (Non-medicated)', 380],
];
export const GUIDE_PRODUCTS = products.map(([id, category, group, need, name, price]) => ({
  id: `product_${id}`, category, group, need, name, price,
  requiresPrescription: category === 'Prescription diet',
  // The PDF groups multiple forms under one price. Confirm the actual item
  // and its package contents before any course-to-package calculation.
  unit: 'item / package', source: 'Product Selection Guide',
}));
