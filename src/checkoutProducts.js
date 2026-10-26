// Reception may add retail shampoo/accessories; clinical charges come from the saved visit.
export const isCheckoutAddon = product => !!product && !product.requiresPrescription && ['Pet shampoo', 'Pet accessories'].includes(product.category);
