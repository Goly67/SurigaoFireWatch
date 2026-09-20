/**
 * HISTORICAL FIRES — real, sourced incidents (not sample data).
 *
 * Unlike surigao.js's seedReports (fabricated demo pins), every entry here is
 * built from published reporting or a local-government document. Locations
 * are placed at the barangay/purok level, NOT a verified street address —
 * exact lot-level coordinates for a purok are not published anywhere public,
 * so `location` is the nearest confident anchor point and `locationNote`
 * says so plainly. Re-geocode before treating a pin as authoritative.
 *
 * Add new fires here as they're documented. Each needs at least one source.
 */

export const historicalFires = [
  {
    id: 'taft-2026-08-12',
    name: 'Nueva Purok Zenia / Espina Purok Sampaguita fire',
    barangayId: 'taft',
    barangayName: 'Taft',
    // Exact ignition point and direction provided by the user:
    // 9°46'43.8"N, 125°29'33.2"E to 9°46'46.6"N, 125°29'30.5"E.
    location: [9.778833333, 125.492555556],
    locationNote:
      'Exact ignition point from the field reference: 9°46\'43.8"N, 125°29\'33.2"E. The documented spread ran toward 9°46\'46.6"N, 125°29\'30.5"E. This is the anchor used for the August 2026 historical fire.',
    fuel: 'dense_residential',
    startedAt: '2026-08-12T12:48:00+08:00',
    containedAt: '2026-08-12T15:11:00+08:00',
    cause: 'Undetermined at time of city council briefing (13 Aug 2026)',
    familiesAffected: null,
    individualsAffected: null,
    housesAffected: 83,
    summary:
      'Fire broke out at 12:48 p.m. between Espina Extension and Nueva Street (Nueva Purok Zenia / Espina Purok Sampaguita), Barangay Taft, and spread rapidly, reportedly pushed by strong winds through combustible light-material housing. The City Fire Marshal declared it under control at 3:11 p.m. The Surigao del Norte Police Provincial Office deployed personnel for peace and order during and after the incident. Relief goods (87 sets — food packs, beddings, hygiene kits, water) went out that evening to families sheltering at the Barangay Taft Gymnasium, with the Provincial Government, CSWDO, and civic groups including the Rotary Club of Surigao City (clean water) all contributing. A separate fire hit nearby Barangay Nabago on 9 Aug 2026 (42 households).',
    sources: [
      {
        label: 'Sangguniang Panlungsod (City Council) minutes, 31st regular session, 13 Aug 2026',
        url: 'https://sp.surigaocity.gov.ph/pdfViewer.html?dir=C%3A%5CWEBFILES%5CREFERRALS&filename=2026%5C20261786692246430%5CFINAL_Minutes-31st-RS-08-13-26_reviewed_by_ghsa-7568268128656755874.pdf',
      },
      {
        label: 'Provincial Government of Surigao del Norte — relief distribution notice',
        url: 'https://surigaodelnorte.gov.ph/%F0%9D%97%A3%F0%9D%97%A5%F0%9D%97%A2%F0%9D%97%A9%F0%9D%97%9C%F0%9D%97%A1%F0%9D%97%96%F0%9D%97%98-%F0%9D%97%A4%F0%9D%97%A8%F0%9D%97%9C%F0%9D%97%96%F0%9D%97%9E%F0%9D%97%9F%F0%9D%97%AC-%F0%9D%97%97-2/',
      },
      {
        label: 'Surigao del Norte Police Provincial Office — press release, 13 Aug 2026',
        url: 'https://www.facebook.com/SurigaodelNortePulis/posts/press-releaseaugust-13-2026%F0%9D%90%92%F0%9D%90%94%F0%9D%90%91%F0%9D%90%88%F0%9D%90%86%F0%9D%90%80%F0%9D%90%8E-%F0%9D%90%83%F0%9D%90%84%F0%9D%90%8B-%F0%9D%90%8D%F0%9D%90%8E%F0%9D%90%91%F0%9D%90%93%F0%9D%90%84-%F0%9D%90%8F%F0%9D%90%8E%F0%9D%90%8B%F0%9D%90%88%F0%9D%90%82%F0%9D%90%84-%F0%9D%90%92%F0%9D%90%84%F0%9D%90%82%F0%9D%90%94%F0%9D%90%91%F0%9D%90%84%F0%9D%90%92-%F0%9D%90%8F%F0%9D%90%84%F0%9D%90%80%F0%9D%90%82%F0%9D%90%84-%F0%9D%90%80%F0%9D%90%8D%F0%9D%90%83-%F0%9D%90%8E%F0%9D%90%91%F0%9D%90%83%F0%9D%90%84%F0%9D%90%91-%F0%9D%90%83%F0%9D%90%94%F0%9D%90%91%F0%9D%90%88/1044627881798828/',
      },
    ],
    verificationNote:
      'The "hundreds of houses burned" figure often attached to this date actually belongs to a different, larger fire in the same barangay on 25 Nov 2025 (see taft-2025-11-25 below) — no family/house count for this Aug 12 fire specifically has turned up in public reporting yet. Update familiesAffected/housesAffected here once a DSWD DROMIC or CSWDO report for this date is published.',
  },
];

export function getHistoricalFire(id) {
  return historicalFires.find((fire) => fire.id === id) ?? null;
}