export const notImplementedProvider = {
  id: 'not-implemented',

  supports() {
    return false;
  },

  async lookup() {
    throw new Error(
      'Real metadata provider lookups are not implemented yet.',
    );
  },

  toMetadataRecord() {
    throw new Error(
      'Real metadata provider mapping is not implemented yet.',
    );
  },
};
