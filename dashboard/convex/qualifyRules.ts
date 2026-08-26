/**
 * The property's qualification rules, as a pure function.
 *
 * Extracted so the voice agent and the WhatsApp bot cannot drift apart on who qualifies.
 * Two copies of this logic would mean a caller could be told "yes" on WhatsApp and "no" on the
 * phone for the same facts, which is exactly the failure this boundary exists to prevent:
 * the model never decides qualification, this code does.
 *
 * Deliberately knows nothing about either channel — no conversation ids, no database, no
 * network. Inputs in, decision out.
 */

export type Unit = {
  bedrooms: string;
  rentMin: number;
  rentMax: number;
  available: boolean;
};

export type Property = {
  name: string;
  units: Unit[];
  petsAllowed: boolean;
};

export type QualifyInput = {
  bedrooms?: string;
  budget?: number;
  petsWanted?: boolean;
};

export type QualifyResult = {
  qualifies: boolean;
  disqualifyReason?: string;
};

/**
 * Only three things can disqualify someone: no available unit of the type they want, a budget
 * below that unit's floor, or pets at a property that doesn't allow them. Nothing about how
 * the person writes, their name, or anything else they mention may ever factor in.
 *
 * Note `moveInDate` is captured elsewhere but is deliberately not a rule — it never has been.
 */
export function evaluateQualification(
  property: Property,
  input: QualifyInput,
): QualifyResult {
  const unit = property.units.find((u) => u.bedrooms === input.bedrooms);

  if (!unit || !unit.available) {
    return {
      qualifies: false,
      disqualifyReason: `No available ${input.bedrooms} units right now.`,
    };
  }

  if (typeof input.budget === "number" && input.budget < unit.rentMin) {
    return {
      qualifies: false,
      disqualifyReason: `Rent for a ${input.bedrooms} starts at $${unit.rentMin}, above the stated budget.`,
    };
  }

  if (input.petsWanted === true && !property.petsAllowed) {
    return {
      qualifies: false,
      disqualifyReason: `${property.name} does not allow pets.`,
    };
  }

  return { qualifies: true };
}

/** The five fields that must all be present before a qualification decision is meaningful. */
export function hasAllQualificationFields(input: {
  bedrooms?: string;
  moveInDate?: string;
  budget?: number;
  petsWanted?: boolean;
  callerName?: string;
  callerPhone?: string;
}): boolean {
  return (
    Boolean(input.bedrooms) &&
    Boolean(input.moveInDate) &&
    typeof input.budget === "number" &&
    typeof input.petsWanted === "boolean" &&
    Boolean(input.callerName) &&
    Boolean(input.callerPhone)
  );
}
