import { Injectable } from '@angular/core';
import { BoothAllocationMode, Sponsor, SponsorType } from '@shared/model/sponsor.model';

/**
 * Result of one automatic booth allocation run for a sponsor type.
 */
export interface SponsorBoothAllocationResult {
  /** Sponsor type processed by the allocation run. */
  sponsorTypeId: string;
  /** Allocation mode effectively used for the run. */
  allocationMode: BoothAllocationMode;
  /** All confirmed sponsors processed by the run, with booth names rewritten. */
  processedSponsors: Sponsor[];
  /** Sponsors that received a booth during the run. */
  allocatedSponsors: Sponsor[];
  /** Sponsors that remain without booth after the run. */
  unallocatedSponsors: Sponsor[];
}

/**
 * Optional execution hooks used mainly by tests.
 */
interface SponsorBoothAllocationOptions {
  /** Optional pseudo-random generator used by random mode. */
  random?: () => number;
}

/**
 * Computes automatic booth allocations for one sponsor type.
 */
@Injectable({ providedIn: 'root' })
export class SponsorBoothAllocationService {
  /**
   * Allocates booths for confirmed sponsors of one sponsor type.
   *
   * Manual mode is intentionally ignored and returns the eligible sponsors unchanged.
   * Automatic modes always start by clearing any previous booth assignment on the processed sponsors.
   *
   * @param sponsorType Sponsor type definition driving the allocation strategy.
   * @param sponsors Full sponsor list for the conference.
   * @param options Optional deterministic hooks used by tests.
   * @returns Allocation report with allocated and unallocated sponsors.
   */
  public allocateForSponsorType(
    sponsorType: SponsorType,
    sponsors: Sponsor[],
    options?: SponsorBoothAllocationOptions
  ): SponsorBoothAllocationResult {
    const availableBooths = this.normalizeBoothNames(sponsorType.boothNames);
    const processedSponsors = sponsors
      .filter((sponsor) => sponsor.status === 'CONFIRMED' && sponsor.sponsorTypeId === sponsorType.id)
      .map((sponsor) => ({
        ...sponsor,
        boothName: '',
      }));

    if (sponsorType.boothAllocationMode === 'MANUAL' || availableBooths.length === 0) {
      return {
        sponsorTypeId: sponsorType.id,
        allocationMode: sponsorType.boothAllocationMode,
        processedSponsors,
        allocatedSponsors: [],
        unallocatedSponsors: processedSponsors,
      };
    }

    const random = options?.random ?? Math.random;
    const allocatedSponsors =
      sponsorType.boothAllocationMode === 'RANDOM'
        ? this.allocateRandomly(processedSponsors, availableBooths, random)
        : this.allocateByWishes(processedSponsors, availableBooths, sponsorType.boothAllocationMode);

    const unallocatedSponsors = allocatedSponsors.filter((sponsor) => !String(sponsor.boothName ?? '').trim());

    return {
      sponsorTypeId: sponsorType.id,
      allocationMode: sponsorType.boothAllocationMode,
      processedSponsors: allocatedSponsors,
      allocatedSponsors: allocatedSponsors.filter((sponsor) => !!String(sponsor.boothName ?? '').trim()),
      unallocatedSponsors,
    };
  }

  /**
   * Allocates booths by sponsor wishes after sorting sponsors according to the configured mode.
   *
   * @param sponsors Eligible sponsors with booth names already cleared.
   * @param availableBooths Booths allowed for the sponsor type.
   * @param allocationMode Automatic allocation mode based on one business date.
   * @returns Updated sponsors with booth assignments when a wish can be satisfied.
   */
  private allocateByWishes(
    sponsors: Sponsor[],
    availableBooths: string[],
    allocationMode: Exclude<BoothAllocationMode, 'MANUAL' | 'RANDOM'>
  ): Sponsor[] {
    const remainingBooths = [...availableBooths];

    return [...sponsors]
      .sort((left, right) => this.compareSponsors(left, right, allocationMode))
      .map((sponsor) => {
        const selectedBooth = this.normalizeBoothNames(sponsor.boothWishes).find((boothName) =>
          remainingBooths.includes(boothName)
        );
        if (!selectedBooth) {
          return sponsor;
        }
        remainingBooths.splice(remainingBooths.indexOf(selectedBooth), 1);
        return {
          ...sponsor,
          boothName: selectedBooth,
        };
      });
  }

  /**
   * Allocates booths randomly while ignoring wishes, as defined by the random mode.
   *
   * @param sponsors Eligible sponsors with booth names already cleared.
   * @param availableBooths Booths allowed for the sponsor type.
   * @param random Random generator used for deterministic tests when needed.
   * @returns Updated sponsors with random booth assignments.
   */
  private allocateRandomly(
    sponsors: Sponsor[],
    availableBooths: string[],
    random: () => number
  ): Sponsor[] {
    const shuffledSponsors = this.shuffle([...sponsors], random);
    const shuffledBooths = this.shuffle([...availableBooths], random);

    return shuffledSponsors.map((sponsor, index) => ({
      ...sponsor,
      boothName: shuffledBooths[index] ?? '',
    }));
  }

  /**
   * Compares two sponsors according to the configured allocation date.
   *
   * @param left First sponsor.
   * @param right Second sponsor.
   * @param allocationMode Automatic allocation mode based on one business date.
   * @returns Sort order used by the allocation algorithm.
   */
  private compareSponsors(
    left: Sponsor,
    right: Sponsor,
    allocationMode: Exclude<BoothAllocationMode, 'MANUAL' | 'RANDOM'>
  ): number {
    const leftDate = this.dateForMode(left, allocationMode);
    const rightDate = this.dateForMode(right, allocationMode);
    const missingDateOrder = Number(!leftDate) - Number(!rightDate);
    if (missingDateOrder !== 0) {
      return missingDateOrder;
    }

    const dateOrder = leftDate.localeCompare(rightDate);
    if (dateOrder !== 0) {
      return dateOrder;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  }

  /**
   * Resolves the date used to sort one sponsor for the requested mode.
   *
   * @param sponsor Sponsor to inspect.
   * @param allocationMode Automatic allocation mode based on one business date.
   * @returns Normalized sortable date, or an empty string when unavailable.
   */
  private dateForMode(
    sponsor: Sponsor,
    allocationMode: Exclude<BoothAllocationMode, 'MANUAL' | 'RANDOM'>
  ): string {
    switch (allocationMode) {
      case 'REGISTRATION_DATE':
        return String(sponsor.registrationDate ?? '').trim();
      case 'WISHES_DATE':
        return String(sponsor.boothWishesDate ?? '').trim();
      case 'CONFIRMATION_DATE':
        return String(sponsor.statusDate ?? '').trim();
      case 'PAYMENT_DATE':
        return String(sponsor.paymentStatusDate ?? '').trim();
    }
  }

  /**
   * Returns trimmed, deduplicated, non-empty booth names while preserving the initial order.
   *
   * @param boothNames Raw booth names.
   * @returns Normalized booth names.
   */
  private normalizeBoothNames(boothNames: string[]): string[] {
    return Array.from(
      new Set(
        (boothNames ?? [])
          .map((boothName) => String(boothName ?? '').trim())
          .filter((boothName) => !!boothName)
      )
    );
  }

  /**
   * Shuffles one array using Fisher-Yates.
   *
   * @param values Values to shuffle.
   * @param random Random generator.
   * @returns Shuffled copy.
   */
  private shuffle<T>(values: T[], random: () => number): T[] {
    const next = [...values];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
  }
}
