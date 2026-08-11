import { HttpRouter } from '@effect/platform';
import { deletePhotoEndpoint } from './delete/endpoint.js';
import { getPhotoEndpoint } from './get/endpoint.js';
import { photoManifestEndpoint } from './manifest/endpoint.js';
import { putPhotoEndpoint } from './put/endpoint.js';

export const photosRouter = HttpRouter.empty.pipe(
	HttpRouter.get('/api/photos', photoManifestEndpoint),
	HttpRouter.put('/api/photos/:beanId', putPhotoEndpoint),
	HttpRouter.get('/api/photos/:beanId', getPhotoEndpoint),
	HttpRouter.del('/api/photos/:beanId', deletePhotoEndpoint)
);
