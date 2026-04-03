/**
 * FTC Funeral Rule — General Price List Generator
 *
 * The FTC Funeral Rule (16 CFR Part 453) requires:
 * 1. Present GPL at the start of arrangement conference
 * 2. Provide itemized Statement of Funeral Goods and Services Selected
 * 3. Casket Price List available upon request
 * 4. Outer Burial Container Price List available upon request
 *
 * Violations: up to $50,000+ per incident.
 */

export interface GPLItem {
  category: string;
  item: string;
  price: number;
  description: string;
  required_disclosure?: string;
}

// Default GPL structure — funeral home will customize prices
export const DEFAULT_GPL_CATEGORIES: GPLItem[] = [
  // Professional Services
  { category: 'Professional Services', item: 'Basic services of funeral director and staff', price: 0, description: 'Includes arrangement conference, coordination with cemetery/crematory, preparation and filing of necessary documents, and all overhead.', required_disclosure: 'This fee for our basic services will be added to the total cost of the funeral arrangements you select. (This fee is already included in our charges for direct cremations, immediate burials, and forwarding or receiving remains.)' },
  { category: 'Professional Services', item: 'Embalming', price: 0, description: 'Except in certain special cases, embalming is not required by law.', required_disclosure: 'Embalming is not required by law. You may choose cremation, immediate burial, or a closed-casket funeral without viewing or visitation, which does not require embalming.' },
  { category: 'Professional Services', item: 'Other preparation of body', price: 0, description: 'Bathing, handling, dressing, cosmetology, hairdressing, manicure.' },
  { category: 'Professional Services', item: 'Refrigeration (per day)', price: 0, description: 'Refrigeration of remains when embalming is not selected.' },

  // Facilities & Equipment
  { category: 'Facilities & Equipment', item: 'Use of facilities for viewing/visitation', price: 0, description: 'Includes setup of visitation room, staff during visitation hours.' },
  { category: 'Facilities & Equipment', item: 'Use of facilities for funeral ceremony', price: 0, description: 'Includes setup of chapel, staff during service.' },
  { category: 'Facilities & Equipment', item: 'Use of facilities for memorial service', price: 0, description: 'When remains are not present.' },
  { category: 'Facilities & Equipment', item: 'Equipment and staff for graveside service', price: 0, description: 'Includes tent, chairs, lowering device, artificial grass.' },

  // Transportation
  { category: 'Transportation', item: 'Transfer of remains to funeral home', price: 0, description: 'Removal/initial transfer of remains within service area.' },
  { category: 'Transportation', item: 'Hearse (local)', price: 0, description: 'Funeral coach for local services.' },
  { category: 'Transportation', item: 'Service/utility vehicle', price: 0, description: 'For flower delivery, equipment transport.' },
  { category: 'Transportation', item: 'Limousine/family car', price: 0, description: 'Family transportation to and from service.' },

  // Merchandise
  { category: 'Merchandise', item: 'Caskets', price: 0, description: 'A complete price list will be provided at the funeral home.', required_disclosure: 'A complete price list will be provided at the funeral home.' },
  { category: 'Merchandise', item: 'Outer burial containers (vaults)', price: 0, description: 'A complete price list will be provided at the funeral home.', required_disclosure: 'In most areas of the country, state or local law does not require that you buy a container to surround the casket in the grave. However, many cemeteries require that you have such a container so that the grave will not sink in.' },
  { category: 'Merchandise', item: 'Urns', price: 0, description: 'For cremated remains.' },

  // Package prices
  { category: 'Package Services', item: 'Direct cremation', price: 0, description: 'Includes removal, necessary authorizations, cremation, and return of cremains.' },
  { category: 'Package Services', item: 'Immediate burial', price: 0, description: 'Includes removal, local transportation to cemetery, and burial.' },
  { category: 'Package Services', item: 'Forwarding remains to another funeral home', price: 0, description: 'Includes removal, embalming, and local transportation.' },
  { category: 'Package Services', item: 'Receiving remains from another funeral home', price: 0, description: 'Includes transportation from airport, care of remains, and arrangement of local service.' },

  // Additional items
  { category: 'Additional Items', item: 'Funeral programs/memorial folders', price: 0, description: 'Per set of 100.' },
  { category: 'Additional Items', item: 'Register book', price: 0, description: 'Guest register book.' },
  { category: 'Additional Items', item: 'Thank you cards', price: 0, description: 'Per box of 25.' },
  { category: 'Additional Items', item: 'Prayer/memorial cards', price: 0, description: 'Per set of 100.' },
  { category: 'Additional Items', item: 'Certified copies of death certificate', price: 0, description: 'Per copy, includes filing fee.' },
  { category: 'Additional Items', item: 'Obituary placement (newspaper)', price: 0, description: 'Newspaper fees are additional and vary.' },
];

/**
 * Generate the Statement of Funeral Goods and Services Selected.
 * This is the itemized bill that must be signed by the family.
 */
export function generateStatement(
  selectedItems: { item: string; price: number }[],
  cashAdvanceItems: { item: string; amount: number }[] = []
): { items: typeof selectedItems; cash_advances: typeof cashAdvanceItems; total: number } {
  const serviceTotal = selectedItems.reduce((sum, i) => sum + i.price, 0);
  const cashTotal = cashAdvanceItems.reduce((sum, i) => sum + i.amount, 0);

  return {
    items: selectedItems,
    cash_advances: cashAdvanceItems,
    total: serviceTotal + cashTotal,
  };
}
