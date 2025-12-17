import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// TODO: Add vehicle controllers
// router.get('/', authenticate, vehicleController.getAllVehicles);
// router.get('/:id', authenticate, vehicleController.getVehicle);
// router.post('/', authenticate, vehicleController.createVehicle);
// router.put('/:id', authenticate, vehicleController.updateVehicle);
// router.delete('/:id', authenticate, vehicleController.deleteVehicle);

export default router;
