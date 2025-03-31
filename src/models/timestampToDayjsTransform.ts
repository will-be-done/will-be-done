import dayjs, { isDayjs, type Dayjs } from "dayjs";
import { type ModelPropTransform } from "mobx-keystone";

export const timestampToDayjsTransform: () => ModelPropTransform<
  number,
  Dayjs
> = () => ({
  transform({ originalValue, cachedTransformedValue }) {
    return cachedTransformedValue ?? dayjs(originalValue);
  },

  untransform({ transformedValue, cacheTransformedValue }) {
    if (isDayjs(transformedValue)) {
      cacheTransformedValue();
    }
    return transformedValue.valueOf();
  },
});
