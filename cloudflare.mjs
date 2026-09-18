import {DurableObject} from 'cloudflare:workers';
import worker from './worker.mjs';
import {reserveAllowance} from './lib/fallback-budget.mjs';

export class FallbackBudget extends DurableObject {
  reserve(amount) {return reserveAllowance(this.ctx.storage,amount);}
}
export default worker;
