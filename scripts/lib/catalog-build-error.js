export class CatalogBuildError extends Error {
  constructor(message, report = null) {
    super(message);
    this.name = 'CatalogBuildError';
    this.report = report;
  }
}
