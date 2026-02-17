import { setGlobalOptions } from 'firebase-functions';
import { createPerson } from './http/create-person';
import { importConferenceHall } from './http/import-conference-hall';
import { resetConferenceHallImport } from './http/reset-conference-hall-import';

setGlobalOptions({ maxInstances: 10 });

export { createPerson, importConferenceHall, resetConferenceHallImport };
