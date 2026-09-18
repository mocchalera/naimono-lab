// Full wire responses for an injected AI binding; these are not live Jev results.
export const evidenceIds = ['exists','everyday','names','culture','places_products','specialist','variants'];
export function jevResponse(exists = .1, overrides = {}) {
  return {model:'fixture-jev',answers:{
    ...Object.fromEntries(evidenceIds.map(id => [id,{type:'noul',noul:id === 'exists' ? exists : .01}])),
    name_risk:{type:'score',score:.4},
    compound:{type:'noul',noul:.01},
    sentence:{type:'noul',noul:.01},
    ...overrides
  }};
}
