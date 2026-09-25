import * as yup from 'yup';
export const DonutChartFormSchema = yup.object().shape({
  name: yup.string().max(50, 'Widget name must be at most 50 characters'),
  donutChartLabel: yup.string().required('Donut chart label is required'),

  locations: yup
    .array()
    .of(
      yup.object().shape({
        product: yup.string().required('Product is required'),
        interval1: yup.string().required('Interval 1 is required'),
        interval2: yup.string().required('Interval 2 is required'),
      })
    )
    .min(1, 'At least one location is required'),
});
