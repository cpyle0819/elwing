import { resourceTypes, nodeTypeName } from './resource-types.js';
export function createServiceCatalog(services) {
  const serviceMap = Object.fromEntries(services.map((service) => [service.id, service]));
  serviceMap.custom = {
    id: 'custom',
    name: 'Custom',
    defaultName: 'Your label here...',
    category: 'Custom',
    aliases: 'Generic box',
  };
  serviceMap.group = { id: 'group', name: 'Group' };
  for (const type of resourceTypes)
    serviceMap[type.id] = {
      ...serviceMap[type.service],
      resourceType: type.id,
      defaultName: type.name.slice(0, 60),
    };

  return serviceMap;
}
export function serviceLabel(node, serviceMap) {
  const service = serviceMap[node.service].name;
  const type = nodeTypeName(node);
  return (
    service +
    (type ? ' · ' + (type.startsWith(service + ' ') ? type.slice(service.length + 1) : type) : '')
  );
}
