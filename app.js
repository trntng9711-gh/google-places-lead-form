(function () {
  const form = document.querySelector('#leadForm');
  const submitButton = document.querySelector('#submitButton');
  const resetButton = document.querySelector('#resetButton');
  const copyPayloadButton = document.querySelector('#copyPayloadButton');
  const payloadPreview = document.querySelector('#payloadPreview');
  const statusBox = document.querySelector('#statusBox');

  const storageKey = 'googlePlacesLeadFinderForm';
  const configStorageKey = 'googlePlacesLeadFinderConfig';
  const provincesApiBase = 'https://provinces.open-api.vn/api/v2';
  const provincesCacheKey = 'googlePlacesLeadFinderProvincesV2';

  const fields = {
    webhookUrl: document.querySelector('#webhookUrl'),
    campaignName: document.querySelector('#campaignName'),
    keyword: document.querySelector('#keyword'),
    location: document.querySelector('#location'),
    province: document.querySelector('#province'),
    ward: document.querySelector('#ward'),
    maxResults: document.querySelector('#maxResults'),
    sheetId: document.querySelector('#sheetId'),
    sheetName: document.querySelector('#sheetName')
  };

  function trimValue(input) {
    return input.value.trim();
  }

  function selectedText(select) {
    const option = select.options[select.selectedIndex];
    return option && option.value ? option.textContent.trim() : '';
  }

  function compactObject(value) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== '' && item !== null && item !== undefined)
    );
  }

  function buildLocationFromParts(payload) {
    const parts = [payload.ward, payload.province, 'Vietnam'].filter(Boolean);
    return parts.join(', ');
  }

  function buildPayload() {
    const maxResults = Number.parseInt(fields.maxResults.value, 10);

    const payload = compactObject({
      campaign_name: trimValue(fields.campaignName),
      keyword: trimValue(fields.keyword),
      location: trimValue(fields.location),
      province: selectedText(fields.province),
      ward: selectedText(fields.ward),
      max_results: Number.isFinite(maxResults) ? Math.min(Math.max(maxResults, 1), 20) : 20,
      sheet_id: trimValue(fields.sheetId),
      sheet_name: trimValue(fields.sheetName) || 'Leads'
    });

    if (!payload.location && payload.province) {
      payload.location = buildLocationFromParts(payload);
    }

    return payload;
  }

  function updatePreview() {
    payloadPreview.textContent = JSON.stringify(buildPayload(), null, 2);
  }

  function showStatus(type, message) {
    statusBox.className = `status show ${type}`;
    statusBox.textContent = message;
  }

  function clearStatus() {
    statusBox.className = 'status';
    statusBox.textContent = '';
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Đang gửi...' : 'Gửi campaign';
  }

  function saveDraft() {
    const draft = {
      campaignName: fields.campaignName.value,
      keyword: fields.keyword.value,
      location: fields.location.value,
      province: fields.province.value,
      ward: fields.ward.value,
      maxResults: fields.maxResults.value,
      sheetId: fields.sheetId.value,
      sheetName: fields.sheetName.value
    };

    const config = {
      webhookUrl: fields.webhookUrl.value
    };

    localStorage.setItem(storageKey, JSON.stringify(draft));
    localStorage.setItem(configStorageKey, JSON.stringify(config));
  }

  function loadSavedValues() {
    const draft = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const config = JSON.parse(localStorage.getItem(configStorageKey) || '{}');

    fields.webhookUrl.value = config.webhookUrl || '';
    fields.campaignName.value = draft.campaignName || 'aromaland_laundry_hcm';
    fields.keyword.value = draft.keyword || 'tiem giat say';
    fields.location.value = draft.location || '';
    fields.maxResults.value = draft.maxResults || '20';
    fields.sheetId.value = draft.sheetId || '';
    fields.sheetName.value = draft.sheetName || 'Leads';
  }

  function setOptions(select, options, placeholder) {
    select.replaceChildren();

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);

    options.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.code);
      option.textContent = item.name;
      select.appendChild(option);
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async function loadProvinces() {
    const cached = JSON.parse(localStorage.getItem(provincesCacheKey) || 'null');

    if (Array.isArray(cached) && cached.length > 0) {
      setOptions(fields.province, cached, 'Chọn tỉnh / thành phố');
      return cached;
    }

    const provinces = await fetchJson(`${provincesApiBase}/p/`);
    localStorage.setItem(provincesCacheKey, JSON.stringify(provinces));
    setOptions(fields.province, provinces, 'Chọn tỉnh / thành phố');
    return provinces;
  }

  async function loadWards(provinceCode, selectedWardCode) {
    fields.ward.disabled = true;
    setOptions(fields.ward, [], provinceCode ? 'Đang tải phường / xã...' : 'Chọn tỉnh / thành phố trước');

    if (!provinceCode) {
      updatePreview();
      return;
    }

    const provinceDetail = await fetchJson(`${provincesApiBase}/p/${provinceCode}?depth=2`);
    const wards = provinceDetail.wards || [];

    setOptions(fields.ward, wards, 'Chọn phường / xã');
    fields.ward.disabled = false;

    if (selectedWardCode) {
      fields.ward.value = selectedWardCode;
    }

    updatePreview();
  }

  async function initializeAdminDropdowns() {
    const draft = JSON.parse(localStorage.getItem(storageKey) || '{}');

    try {
      await loadProvinces();

      if (draft.province) {
        fields.province.value = draft.province;
        await loadWards(draft.province, draft.ward);
      } else {
        fields.province.value = '';
        setOptions(fields.ward, [], 'Chọn tỉnh / thành phố trước');
        fields.ward.disabled = true;
      }
    } catch (error) {
      setOptions(fields.province, [], 'Không tải được dữ liệu địa giới');
      setOptions(fields.ward, [], 'Nhập Location ưu tiên để tiếp tục');
      fields.ward.disabled = true;
      showStatus('error', 'Không tải được dropdown địa giới. Bạn vẫn có thể nhập Location ưu tiên rồi gửi campaign.');
    }

    updatePreview();
  }

  function validatePayload(payload) {
    if (!trimValue(fields.webhookUrl)) {
      return 'Vui lòng nhập n8n production webhook URL.';
    }

    if (!payload.campaign_name) {
      return 'Vui lòng nhập tên campaign.';
    }

    if (!payload.keyword) {
      return 'Vui lòng nhập keyword.';
    }

    if (!payload.location && !payload.province) {
      return 'Vui lòng nhập location hoặc tỉnh/thành phố.';
    }

    if (payload.max_results < 1 || payload.max_results > 20) {
      return 'max_results phải nằm trong khoảng 1 đến 20.';
    }

    return '';
  }

  async function submitCampaign(event) {
    event.preventDefault();
    clearStatus();

    const payload = buildPayload();
    const error = validatePayload(payload);

    if (error) {
      showStatus('error', error);
      return;
    }

    saveDraft();
    setLoading(true);
    showStatus('info', 'Đang gửi payload sang n8n Webhook...');

    try {
      const response = await fetch(trimValue(fields.webhookUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(responseText || `Webhook trả về HTTP ${response.status}`);
      }

      showStatus('success', 'Đã gửi campaign thành công. Kiểm tra workflow n8n và Google Sheet.');
    } catch (error) {
      showStatus('error', `Gửi thất bại: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payloadPreview.textContent);
      showStatus('success', 'Đã copy payload JSON.');
    } catch (error) {
      showStatus('error', 'Không copy được payload. Hãy copy trực tiếp trong khung preview.');
    }
  }

  function resetForm() {
    form.reset();
    fields.maxResults.value = '20';
    fields.sheetName.value = 'Leads';
    localStorage.removeItem(storageKey);
    clearStatus();
    updatePreview();
  }

  form.addEventListener('submit', submitCampaign);
  resetButton.addEventListener('click', resetForm);
  copyPayloadButton.addEventListener('click', copyPayload);

  Object.values(fields).forEach((field) => {
    field.addEventListener('input', function () {
      saveDraft();
      updatePreview();
    });
  });

  fields.province.addEventListener('change', async function () {
    saveDraft();

    try {
      await loadWards(fields.province.value, '');
    } catch (error) {
      setOptions(fields.ward, [], 'Không tải được phường / xã');
      fields.ward.disabled = true;
      showStatus('error', 'Không tải được phường / xã. Có thể nhập Location ưu tiên để gửi campaign.');
    }

    updatePreview();
  });

  loadSavedValues();
  initializeAdminDropdowns();
})();
