import * as yup from 'yup';

export const LocationSchema = t =>
  yup.object().shape({
    name: yup.string().required(t('addCompany.validation.name')),
    country: yup.string().required(t('addCompany.validation.country')),
    address: yup.string().required(t('addCompany.validation.address')),
    city: yup.string().required(t('addCompany.validation.city')),
    state: yup.string().required(t('addCompany.validation.state')),
    zip_code: yup.string().required(t('addCompany.validation.zip_code')),
    email: yup.string().required(t('addCompany.validation.email')),
    // ISO 4217 code; optional — omitted/empty leaves the company's currency unchanged.
    currency: yup.string(),
    externalId: yup.string(),
  });
