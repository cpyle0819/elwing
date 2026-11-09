import { storageContract } from './storage-contract.mjs';
import { localFixture } from './local-fixture.mjs';
storageContract('local disk', localFixture);
