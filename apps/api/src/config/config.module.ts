import { Global, Module } from '@nestjs/common';
import { env, Env } from './env';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => env() }],
  exports: [ENV],
})
export class AppConfigModule {}
