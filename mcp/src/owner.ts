const owners = new WeakSet<object>();
declare const ownerBrand: unique symbol;
export type Owner = Readonly<{ alias: string; [ownerBrand]: true }>;
export function createOwner(alias: string): Owner {
  const owner = Object.freeze({ alias }) as Owner;
  owners.add(owner);
  return owner;
}
export function localOwner(): Owner {
  return createOwner('local');
}
export function ownerPartition(owner: Owner): string {
  if (!owners.has(owner)) throw new Error('Invalid owner');
  return `OWNER#${owner.alias}`;
}
