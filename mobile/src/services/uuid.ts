import * as Crypto from 'expo-crypto';

export type UuidProvider = () => string;

export const createNativeUuid: UuidProvider = () => Crypto.randomUUID();
