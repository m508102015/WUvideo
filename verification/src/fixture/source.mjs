export function sourceResponse(baseUrl, searchParams) {
  const episodes = `第1集$${baseUrl}/test.mp4#第2集$${baseUrl}/hls/master.m3u8`;
  const id = searchParams.get('ids') || 'fixture-video-1';
  const query = searchParams.get('wd') || '验证视频';
  return {
    code: 1,
    msg: 'ok',
    page: 1,
    pagecount: 1,
    total: 3,
    list: [1, 2, 3].map((number) => ({
      vod_id: number === 1 ? id : `fixture-video-${number}`,
      vod_name: `${query} ${number}`,
      vod_pic: `${baseUrl}/poster.svg?item=${number}`,
      vod_remarks: number === 1 ? '全2集' : '测试内容',
      vod_year: '2026',
      vod_area: 'Fixture',
      vod_actor: 'Automated Validator',
      vod_director: 'KVideo Verification',
      vod_content: 'Deterministic content used only by the local verification suite.',
      type_name: '测试',
      vod_play_from: 'm3u8',
      vod_play_url: episodes,
    })),
  };
}

export function sourceImportPayload(baseUrl) {
  return {
    sources: [{ id: 'imported-fixture', name: 'Imported Fixture', baseUrl, enabled: true, group: 'normal' }],
  };
}

export function posterSvg(item = '1') {
  const safe = String(item).replace(/[^0-9A-Za-z_-]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#101827"/><circle cx="200" cy="220" r="90" fill="#4f8cff"/><text x="200" y="390" text-anchor="middle" fill="white" font-family="sans-serif" font-size="36">KVideo ${safe}</text></svg>`;
}
