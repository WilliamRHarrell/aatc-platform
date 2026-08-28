import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 11, color: '#222' },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666', marginBottom: 2 },
  hr: { borderBottomWidth: 1, borderBottomColor: '#ccc', marginVertical: 14 },
  sectionTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 10, color: '#333' },
  row: { flexDirection: 'row', marginBottom: 6 },
  label: { width: 140, fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#555' },
  value: { flex: 1, fontSize: 11 },
  veteranBadge: {
    backgroundColor: '#e6f4ea', color: '#1a7f37', fontSize: 10, fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start', marginTop: 6,
  },
  artistHeader: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  artistSubheader: { fontSize: 10, color: '#666', marginBottom: 12 },
  styleChip: {
    fontSize: 9, backgroundColor: '#f0f0f0', color: '#444',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginRight: 4, marginBottom: 4,
  },
  idImage: { maxWidth: 400, maxHeight: 550, objectFit: 'contain', marginTop: 10 },
  contractTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 60, marginBottom: 20 },
  contractText: { fontSize: 11, lineHeight: 1.6, color: '#444', textAlign: 'center' },
  pageNum: { position: 'absolute', bottom: 30, right: 50, fontSize: 8, color: '#aaa' },
  footer: { position: 'absolute', bottom: 30, left: 50, fontSize: 8, color: '#aaa' },
})

export interface BoothPacketData {
  businessName: string
  contactName: string
  email: string
  phone: string | null
  website: string | null
  instagram: string | null
  exhibitorType: 'artist' | 'vendor'
  boothSize: string
  boothNumbers: string[]
  isCorner: boolean
  isVeteran: boolean
  tvShow: string | null
  artists: Array<{
    name: string
    nickname?: string
    instagram?: string
    styles?: string[]
    id_url: string | null
  }>
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  )
}

function PageFooter({ businessName, pageNum }: { businessName: string; pageNum: number }) {
  return (
    <>
      <Text style={s.footer}>{businessName} - Booth Packet</Text>
      <Text style={s.pageNum}>Page {pageNum}</Text>
    </>
  )
}

export default function BoothPacketPDF({ data }: { data: BoothPacketData }) {
  let pageCounter = 0

  const nextPage = () => {
    pageCounter++
    return pageCounter
  }

  return (
    <Document title={`${data.businessName} - Booth Packet`} author="AATC">
      {/* ── Page 1: Studio Information ───────────────────── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>Booth Packet</Text>
          <Text style={s.subtitle}>All American Tattoo Convention 2027</Text>
          <Text style={s.subtitle}>Crown Complex Event Center - Fayetteville, NC</Text>
        </View>

        <View style={s.hr} />

        <Text style={s.sectionTitle}>Studio / Business Information</Text>

        <InfoRow label="Business Name" value={data.businessName} />
        <InfoRow label="Contact Name" value={data.contactName} />
        <InfoRow label="Email" value={data.email} />
        <InfoRow label="Phone" value={data.phone} />
        <InfoRow label="Website" value={data.website} />
        <InfoRow label="Instagram" value={data.instagram ? `@${data.instagram}` : null} />

        <View style={s.hr} />

        <Text style={s.sectionTitle}>Booth Details</Text>

        <InfoRow label="Exhibitor Type" value={data.exhibitorType.charAt(0).toUpperCase() + data.exhibitorType.slice(1)} />
        <InfoRow label="Booth Size" value={data.boothSize.charAt(0).toUpperCase() + data.boothSize.slice(1) + ' (10\'x10\' per unit)'} />
        <InfoRow label="Booth Number(s)" value={data.boothNumbers.join(', ') || 'Not yet assigned'} />
        <InfoRow label="Corner Booth" value={data.isCorner ? 'Yes' : 'No'} />
        {data.exhibitorType === 'artist' && (
          <InfoRow label="Artists" value={`${data.artists.length} artist${data.artists.length !== 1 ? 's' : ''}`} />
        )}
        {data.tvShow && <InfoRow label="TV Show" value={data.tvShow} />}

        {data.isVeteran && (
          <View style={s.veteranBadge}>
            <Text>VETERAN - Discount Applied</Text>
          </View>
        )}

        <PageFooter businessName={data.businessName} pageNum={1} />
      </Page>

      {/* ── Artist Pages ─────────────────────────────────── */}
      {data.artists.map((artist, i) => {
        const artistName = artist.nickname || artist.name || `Artist ${i + 1}`
        const infoPageNum = 2 + i * 2
        const idPageNum = infoPageNum + 1

        return [
          /* Artist Info Page */
          <Page key={`artist-info-${i}`} size="LETTER" style={s.page}>
            <View style={s.header}>
              <Text style={s.artistHeader}>Artist {i + 1}: {artistName}</Text>
              <Text style={s.artistSubheader}>{data.businessName}</Text>
            </View>

            <View style={s.hr} />

            <Text style={s.sectionTitle}>Artist Information</Text>

            <InfoRow label="Legal Name" value={artist.name} />
            {artist.nickname && <InfoRow label="Artist / Stage Name" value={artist.nickname} />}
            {artist.instagram && <InfoRow label="Instagram" value={`@${artist.instagram}`} />}

            {artist.styles && artist.styles.length > 0 && (
              <>
                <View style={{ marginTop: 10, marginBottom: 4 }}>
                  <Text style={s.label}>Tattoo Styles</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {artist.styles.map((st, si) => (
                    <Text key={si} style={s.styleChip}>{st}</Text>
                  ))}
                </View>
              </>
            )}

            <View style={{ marginTop: 16 }}>
              <InfoRow label="Government ID" value={artist.id_url ? 'On file (see next page)' : 'Not uploaded'} />
            </View>

            <PageFooter businessName={data.businessName} pageNum={infoPageNum} />
          </Page>,

          /* Artist ID Page */
          <Page key={`artist-id-${i}`} size="LETTER" style={s.page}>
            <View style={s.header}>
              <Text style={s.sectionTitle}>Government ID - {artistName}</Text>
              <Text style={s.artistSubheader}>{data.businessName} · Artist {i + 1}</Text>
            </View>

            <View style={s.hr} />

            {artist.id_url ? (
              <Image src={artist.id_url} style={s.idImage} />
            ) : (
              <View style={{ marginTop: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#999' }}>
                  Government ID has not been uploaded for this artist.
                </Text>
                <Text style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
                  The artist may still upload their ID through the exhibitor portal.
                </Text>
              </View>
            )}

            <PageFooter businessName={data.businessName} pageNum={idPageNum} />
          </Page>,
        ]
      })}

      {/* ── Contract Placeholder ─────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={s.contractTitle}>Exhibitor Agreement</Text>
          <Text style={s.contractText}>
            All American Tattoo Convention 2027
          </Text>
          <Text style={{ ...s.contractText, marginTop: 30, color: '#999' }}>
            [Contract content will be placed here]
          </Text>
          <Text style={{ ...s.contractText, marginTop: 10, color: '#bbb', fontSize: 10 }}>
            This page is a placeholder for the final exhibitor agreement.
          </Text>
        </View>
        <PageFooter businessName={data.businessName} pageNum={data.artists.length * 2 + 2} />
      </Page>
    </Document>
  )
}
