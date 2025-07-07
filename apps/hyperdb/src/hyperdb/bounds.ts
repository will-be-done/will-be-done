/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TupleScanOptions, Value } from "./db";
import { MIN, MAX } from "./db";
import type { WhereClause } from "./query";
import type { IndexConfig } from "./table";

export const convertWhereToBound = (
  index: IndexConfig<any>,
  where: WhereClause[],
): TupleScanOptions[] => {
  return where.map((clause) => {
    const { eq, gte, gt, lte, lt } = clause;

    // Ensure cols is an array
    const indexCols = Array.isArray(index.cols) ? index.cols : [index.cols];

    // Check if columns exist in index
    const allConditions = [...eq, ...gte, ...gt, ...lte, ...lt];
    for (const condition of allConditions) {
      if (!indexCols.map(String).includes(condition.col)) {
        throw new Error(`Column '${condition.col}' not found in index`);
      }
    }

    // Group conditions by column
    const conditionsByCol = new Map<
      string,
      {
        eq?: Value;
        gte?: Value;
        gt?: Value;
        lte?: Value;
        lt?: Value;
      }
    >();

    for (const condition of eq) {
      const colConditions = conditionsByCol.get(condition.col) || {};
      if (colConditions.eq !== undefined) {
        throw new Error(
          `Multiple equality conditions for column '${condition.col}'`,
        );
      }
      colConditions.eq = condition.val;
      conditionsByCol.set(condition.col, colConditions);
    }

    for (const condition of gte) {
      const colConditions = conditionsByCol.get(condition.col) || {};
      colConditions.gte = condition.val;
      conditionsByCol.set(condition.col, colConditions);
    }

    for (const condition of gt) {
      const colConditions = conditionsByCol.get(condition.col) || {};
      colConditions.gt = condition.val;
      conditionsByCol.set(condition.col, colConditions);
    }

    for (const condition of lte) {
      const colConditions = conditionsByCol.get(condition.col) || {};
      colConditions.lte = condition.val;
      conditionsByCol.set(condition.col, colConditions);
    }

    for (const condition of lt) {
      const colConditions = conditionsByCol.get(condition.col) || {};
      colConditions.lt = condition.val;
      conditionsByCol.set(condition.col, colConditions);
    }

    // Check for conflicting conditions (eq cannot coexist with range conditions)
    for (const [col, conditions] of conditionsByCol) {
      if (
        conditions.eq !== undefined &&
        (conditions.gte !== undefined ||
          conditions.gt !== undefined ||
          conditions.lte !== undefined ||
          conditions.lt !== undefined)
      ) {
        throw new Error(`Conflicting conditions for column '${col}'`);
      }
    }

    // Helper function to check if a column has an effective equality condition
    const hasEqualityCondition = (conditions: any) => {
      if (conditions.eq !== undefined) {
        return true;
      }
      // Check if gte and lte have the same value (effective equality)
      if (
        conditions.gte !== undefined &&
        conditions.lte !== undefined &&
        conditions.gte === conditions.lte
      ) {
        return true;
      }
      return false;
    };

    // Find the usable prefix - must be continuous from the start
    let usablePrefix = 0;
    for (let i = 0; i < indexCols.length; i++) {
      const col = String(indexCols[i]);
      const conditions = conditionsByCol.get(col);

      if (!conditions) {
        break; // No condition for this column, stop here
      }

      usablePrefix++;

      // If this is not an equality condition, we cannot use further columns
      if (!hasEqualityCondition(conditions)) {
        break;
      }
    }

    // Check for non-prefix conditions (error case)
    for (const col of conditionsByCol.keys()) {
      const colIndex = indexCols.map(String).indexOf(col);
      if (colIndex >= usablePrefix) {
        throw new Error(
          `Cannot use column '${col}' without specifying eq conditions for all preceding columns`,
        );
      }
    }

    if (usablePrefix === 0) {
      throw new Error("No usable conditions found");
    }

    // Build the tuple bounds
    const result: TupleScanOptions = {};
    const prefixValues: any[] = [];

    // Process equality prefix
    let rangeColumnIndex = -1;
    for (let i = 0; i < usablePrefix; i++) {
      const col = String(indexCols[i]);
      const conditions = conditionsByCol.get(col)!;

      if (conditions.eq !== undefined) {
        prefixValues.push(conditions.eq);
      } else if (
        conditions.gte !== undefined &&
        conditions.lte !== undefined &&
        conditions.gte === conditions.lte
      ) {
        // Effective equality: gte and lte with same value
        prefixValues.push(conditions.gte);
      } else {
        rangeColumnIndex = i;
        break;
      }
    }

    if (rangeColumnIndex === -1) {
      // All conditions are equality - create exact match bounds
      const gteValues = [...prefixValues];
      const lteValues = [...prefixValues];

      // Fill remaining columns with MIN/MAX
      while (gteValues.length < indexCols.length) {
        gteValues.push(MIN);
        lteValues.push(MAX);
      }

      result.gte = gteValues;
      result.lte = lteValues;
    } else {
      // We have a range condition at rangeColumnIndex
      const col = String(indexCols[rangeColumnIndex]);
      const conditions = conditionsByCol.get(col)!;

      // For mixed eq + range conditions, we need a lower bound starting with the equality prefix
      if (prefixValues.length > 0) {
        const gteValues = [...prefixValues];
        while (gteValues.length < indexCols.length) {
          gteValues.push(MIN);
        }
        result.gte = gteValues;
      }

      if (conditions.gte !== undefined) {
        const gteValues = [...prefixValues, conditions.gte];
        while (gteValues.length < indexCols.length) {
          gteValues.push(MIN);
        }
        result.gte = gteValues;

        // For gte with equality prefix, we also need an upper bound for the prefix
        if (prefixValues.length > 0) {
          const lteValues = [...prefixValues];
          while (lteValues.length < indexCols.length) {
            lteValues.push(MAX);
          }
          result.lte = lteValues;
        }
      }

      if (conditions.gt !== undefined) {
        const gtValues = [...prefixValues, conditions.gt];
        while (gtValues.length < indexCols.length) {
          gtValues.push(MAX);
        }
        result.gt = gtValues;

        // For gt with equality prefix, we also need an upper bound for the prefix
        if (prefixValues.length > 0) {
          const lteValues = [...prefixValues];
          while (lteValues.length < indexCols.length) {
            lteValues.push(MAX);
          }
          result.lte = lteValues;
        }
      }

      if (conditions.lte !== undefined) {
        const lteValues = [...prefixValues, conditions.lte];
        while (lteValues.length < indexCols.length) {
          lteValues.push(MAX);
        }
        result.lte = lteValues;
      }

      if (conditions.lt !== undefined) {
        const ltValues = [...prefixValues, conditions.lt];
        while (ltValues.length < indexCols.length) {
          ltValues.push(MIN);
        }
        result.lt = ltValues;
      }
    }

    return result;
  });
};
