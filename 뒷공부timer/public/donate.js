import { $, el, toast, store, api, won, ago } from './common.js';

const PRESET_AMOUNTS = [1000, 3000, 5000, 10000];
let config = { minDonation: 1000, maxDonation: 1000000 };
let amount = 3000;

// ---------- 금액 선택 ----------

function renderAmounts() {
  $('#amounts').replaceChildren(
    ...PRESET_AMOUNTS.map((value) => {
      const button = el('button', { class: `amount${value === amount ? ' on' : ''}`, type: 'button' }, won(value));
      button.addEventListener('click', () => {
        amount = value;
        $('#custom-amount').value = '';
        renderAmounts();
      });
      return button;
    }),
  );
  $('#pay').textContent = amount ? `${won(amount)} 후원하기` : '후원하기';
}

$('#custom-amount').addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 7);
  amount = Number(digits) || 0;
  event.target.value = digits ? amount.toLocaleString('ko-KR') : '';
  renderAmounts();
});

// ---------- 결제 요청 ----------

$('#donate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (amount < config.minDonation || amount > config.maxDonation) {
    return toast(`후원 금액은 ${won(config.minDonation)} ~ ${won(config.maxDonation)} 사이로 입력하세요.`);
  }
  if (typeof TossPayments !== 'function') {
    return toast('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  }

  const payButton = $('#pay');
  payButton.disabled = true;
  try {
    const name = $('#donor-name').value.trim();
    const order = await api('/api/donations/order', {
      method: 'POST',
      body: { amount, name, message: $('#donor-message').value },
    });
    const payment = TossPayments(config.tossClientKey).payment({ customerKey: TossPayments.ANONYMOUS });
    // 결제창으로 이동한다. 성공하면 /donate/success 로 돌아와 서버 승인을 거친다.
    await payment.requestPayment({
      method: 'CARD',
      amount: { currency: 'KRW', value: order.amount },
      orderId: order.orderId,
      orderName: order.orderName,
      successUrl: location.origin + '/donate/success',
      failUrl: location.origin + '/donate/fail',
      customerName: name || undefined,
    });
  } catch (err) {
    if (err.code !== 'USER_CANCEL') toast(err.message || '결제를 시작하지 못했습니다.');
  } finally {
    payButton.disabled = false;
  }
});

// ---------- 결제 결과 (토스가 되돌려보낸 경우) ----------

function showResult(title, body) {
  $('#result-title').textContent = title;
  $('#result-body').textContent = body;
  $('#result').hidden = false;
  $('#form-card').hidden = true;
}

$('#result-again').addEventListener('click', () => {
  $('#result').hidden = true;
  $('#form-card').hidden = false;
});

async function handleReturn() {
  const params = new URLSearchParams(location.search);
  const path = location.pathname;
  if (path === '/donate/success') {
    showResult('승인 처리 중…', '결제사에 확인하고 있습니다. 창을 닫지 마세요.');
    try {
      const done = await api('/api/donations/confirm', {
        method: 'POST',
        body: {
          paymentKey: params.get('paymentKey'),
          orderId: params.get('orderId'),
          amount: Number(params.get('amount')),
        },
      });
      showResult('후원 완료!', `${done.name}님, ${won(done.amount)} 감사합니다. 덕분에 감시망이 하루 더 유지됩니다.`);
    } catch (err) {
      showResult('승인 실패', `${err.message} 결제가 승인되지 않았습니다.`);
    }
  } else if (path === '/donate/fail') {
    const cancelled = params.get('code') === 'PAY_PROCESS_CANCELED';
    showResult(cancelled ? '결제를 취소했습니다' : '결제 실패', params.get('message') || '결제가 완료되지 않았습니다.');
  }
  // 새로고침으로 승인이 다시 요청되지 않게 주소를 정리한다
  if (path !== '/donate') history.replaceState(null, '', '/donate');
}

// ---------- 명예의 전당 ----------

async function loadDonors() {
  const summary = await api('/api/donations');
  $('#raised').replaceChildren(won(summary.total) + ' ', el('small', {}, `· ${summary.count}명 참여`));
  $('#donors').replaceChildren(
    ...(summary.recent.length
      ? summary.recent.map((d) =>
          el(
            'li',
            {},
            el(
              'div',
              {},
              el('span', { class: 'd-name' }, d.name),
              ` · ${ago(d.approvedAt)}`,
              d.message && el('span', { class: 'd-msg' }, d.message),
            ),
            el('span', { class: 'd-amt' }, won(d.amount)),
          ),
        )
      : [el('li', {}, '아직 후원자가 없습니다. 첫 번째 의인이 되어주세요.')]),
  );
}

async function init() {
  $('#donor-name').value = store.get('dgb:name') || '';
  renderAmounts();
  try {
    config = await api('/api/config');
    $('#test-banner').hidden = config.live;
  } catch {
    toast('서버에 연결하지 못했습니다.');
  }
  await handleReturn();
  loadDonors().catch(() => {});
}

init();
