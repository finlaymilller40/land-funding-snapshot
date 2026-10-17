export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-xs text-muted">
        <p className="text-sm text-ink">
          An estimate from public map data, not an offer of grant or financial advice. The Forestry Commission decides
          eligibility and payments.
        </p>
        <p>Contains public sector information licensed under the Open Government Licence v3.0.</p>
        <p>
          Contains data from Natural England, Historic England, the Forestry Commission and the Office for National
          Statistics, used under the Open Government Licence v3.0. England Peat Status is used under the Non-Commercial
          Government Licence. Contains OS data © Crown copyright and database right 2026. Workspace preview map © OpenFreeMap,
          © OpenMapTiles, data © OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  );
}
