import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { CloudinaryStorageDriver } from './drivers/cloudinary-storage.driver';
import {
  STORAGE_DRIVER_TOKEN,
  type StorageDriver,
} from './storage-driver.interface';

@Module({
  providers: [
    LocalStorageDriver,
    CloudinaryStorageDriver,
    {
      // The active driver is chosen by configuration. Adding S3 later means
      // one more class and one more case here, with no change to any caller.
      provide: STORAGE_DRIVER_TOKEN,
      inject: [ConfigService, LocalStorageDriver, CloudinaryStorageDriver],
      useFactory: (
        configService: ConfigService,
        local: LocalStorageDriver,
        cloudinaryDriver: CloudinaryStorageDriver,
      ): StorageDriver => {
        const configured = configService.get<string>('STORAGE_DRIVER', 'local');

        switch (configured) {
          case 'local':
            return local;
          case 'cloudinary':
            return cloudinaryDriver;
          default:
            throw new Error(
              `STORAGE_DRIVER="${configured}" is not implemented. ` +
                'Supported values: local, cloudinary.',
            );
        }
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
