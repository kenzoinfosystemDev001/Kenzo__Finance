import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { CloudinaryStorageDriver } from './drivers/cloudinary-storage.driver';
import { DatabaseStorageDriver } from './drivers/database-storage.driver';
import {
  STORAGE_DRIVER_TOKEN,
  type StorageDriver,
} from './storage-driver.interface';

@Module({
  providers: [
    DatabaseStorageDriver,
    LocalStorageDriver,
    CloudinaryStorageDriver,
    {
      // The driver NEW files are written to. Existing files are always read
      // from wherever their key says they live (see StorageService), so
      // changing this never orphans files saved earlier.
      provide: STORAGE_DRIVER_TOKEN,
      inject: [ConfigService, DatabaseStorageDriver, LocalStorageDriver, CloudinaryStorageDriver],
      useFactory: (
        configService: ConfigService,
        database: DatabaseStorageDriver,
        local: LocalStorageDriver,
        cloudinaryDriver: CloudinaryStorageDriver,
      ): StorageDriver => {
        const configured = configService.get<string>('STORAGE_DRIVER', 'database');

        switch (configured) {
          case 'database':
            return database;
          case 'local':
            return local;
          case 'cloudinary':
            return cloudinaryDriver;
          default:
            throw new Error(
              `STORAGE_DRIVER="${configured}" is not implemented. ` +
                'Supported values: database, local, cloudinary.',
            );
        }
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
