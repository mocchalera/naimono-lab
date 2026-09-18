// Only the fallback allowance needs account-wide coordination. It never holds
// AI requests or user words, and never blocks the normal Jev-only path.
export async function reserveAllowance(storage,amount,{now,maxCalls = 300,maxNeurons = 5000} = {}) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 5000) return false;
  return storage.transaction(async txn=>{
    const day = new Date(now ?? Date.now()).toISOString().slice(0,10);
    const saved = await txn.get('allowance');
    if (saved?.day > day) return false; // Clock rollback must never replenish a quota.
    const value = saved?.day === day ? saved : {day,calls:0,neurons:0};
    if (value.calls >= maxCalls || value.neurons + amount > maxNeurons) return false;
    await txn.put('allowance',{day,calls:value.calls+1,neurons:value.neurons+amount});
    return true;
  });
}
