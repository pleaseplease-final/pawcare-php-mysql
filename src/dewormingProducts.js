// Brands already named by the clinic's deworming service. No stock is invented.
export const DEFAULT_DEWORMING_PRODUCTS = [
  {id:'canex',name:'Canex',lots:[]},
  {id:'drontal',name:'Drontal',lots:[]},
];
// Older service-price responses omit product metadata during rolling deployment.
// An explicitly empty list still means the clinic has configured no products.
export const dewormingProductChoices = response => Array.isArray(response.dewormingProducts)
  ? response.dewormingProducts : DEFAULT_DEWORMING_PRODUCTS;
