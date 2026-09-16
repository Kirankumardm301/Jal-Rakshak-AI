import React, { useEffect, useState } from 'react'
import {
  Bell, ChevronDown, Droplets, Gauge, Settings, LogOut, ShieldCheck,
  TriangleAlert, Activity, Wifi, Zap, Power, FlaskConical, Waves,
  ArrowDownRight, ArrowUpRight, CheckCircle2, Menu, X, Save, SlidersHorizontal,
  Mail, LockKeyhole, Eye, EyeOff,
} from 'lucide-react'

const ESP32_API = 'http://172.24.168.80'
const consumptionPeriods = ['Hourly', 'Daily', 'Weekly', 'Monthly']
const defaultFlowSettings = { normalMinFlow: 2, normalMaxFlow: 10, leakMinFlow: 0.2, leakMaxFlow: 2, leakDurationMinutes: 10, restrictedStart: 23, restrictedEnd: 5, unauthorizedFlowLimit: 10, unauthorizedDurationMinutes: 1 }

function Logo() {
  return <div className="logo-mark"><Droplets size={32} strokeWidth={2.2} /><span>AI</span></div>
}

function Header({ page, setPage, onLogout }) {
  const [open, setOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  return <header className="topbar">
    <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Open navigation">{open ? <X /> : <Menu />}</button>
    <div className="brand" onClick={() => setPage('dashboard')}>
      <Logo />
      <div><strong>Jal Rakshak AI</strong><span>Water Management Dashboard</span></div>
    </div>
    <nav className={open ? 'nav open' : 'nav'}>
      <button className={page === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('dashboard'); setOpen(false) }}>Dashboard</button>
      <button className={page === 'controls' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('controls'); setOpen(false) }}>Controls</button>
      <button className={page === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('settings'); setOpen(false) }}>Settings</button>
    </nav>
    <div className="header-actions">
      <div className="notification-wrap"><button className="icon-button notification" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notifications" aria-expanded={notificationsOpen}><Bell size={22} /><i /></button>{notificationsOpen && <section className="notification-panel" aria-label="Events and alerts"><div className="notification-panel-heading"><strong>Events & alerts</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={16} /></button></div><div className="event-item warning"><TriangleAlert size={18} /><div><strong>Leakage warning</strong><span>Minor leak detected in Sector B.</span><small>Action required</small></div></div><div className="event-item success"><CheckCircle2 size={18} /><div><strong>Security monitoring</strong><span>No theft alerts detected.</span><small>System event</small></div></div><div className="event-item info"><Activity size={18} /><div><strong>Sensor monitoring</strong><span>Live readings update every 10 seconds.</span><small>System event</small></div></div></section>}</div>
      <button className="icon-button" onClick={() => setPage('settings')} aria-label="Settings"><Settings size={22} /></button>
      <button className="icon-button logout" onClick={onLogout} aria-label="Log out"><LogOut size={22} /></button>
    </div>
  </header>
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return <div className="section-title"><div className="soft-icon"><Icon size={25} /></div><div><h2>{title}</h2><p>{subtitle}</p></div></div>
}

function BarChart({ labels = [], values = [], period }) {
  if (!values.length) return <div className="chart-empty">No live data available</div>
  const maxValue = Math.max(...values)
  const formatValue = value => value >= 1000 ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : value
  return <div className="bar-chart" aria-label={`${period} water consumption`}>
    <div className="chart-y"><span>{formatValue(maxValue)}</span><span>{formatValue(maxValue * .75)}</span><span>{formatValue(maxValue * .5)}</span><span>0</span></div>
    <div className="bars">{values.map((value, index) => <div className="bar-col" key={`${period}-${labels[index]}`}><div className="bar" style={{ height: `${Math.max(18, value / maxValue * 165)}px` }} /><span>{labels[index]}</span></div>)}</div>
  </div>
}

function FlowChart({ values = [], labels = [] }) {
  if (!values.length) return <div className="chart-empty">No live data available</div>
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = Math.max(1, maxValue - minValue)
  const points = values.map((value, index) => `${values.length === 1 ? 55 : index * 106 / (values.length - 1) + 2},${78 - ((value - minValue) / range) * 55}`).join(' ')
  return <div className="flow-chart"><div className="flow-y"><span>{maxValue.toFixed(0)}</span><span>{((maxValue + minValue) / 2).toFixed(0)}</span><span>{minValue.toFixed(0)}</span></div><svg viewBox="0 0 110 90" preserveAspectRatio="none" role="img" aria-label="Live water flow chart"><defs><linearGradient id="line" x1="0" x2="1"><stop stopColor="#0794c5" /><stop offset="1" stopColor="#21a9cf" /></linearGradient></defs>{[12, 30, 48, 66, 84].map(y => <line key={y} x1="0" x2="110" y1={y} y2={y} className="gridline" />)}<polyline points={points} fill="none" stroke="url(#line)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="flow-x">{labels.map(label => <span key={label}>{label}</span>)}</div></div>
}

function isRestrictedHour(hour, start, end) {
  return start > end ? hour >= start || hour < end : hour >= start && hour < end
}

function formatDuration(milliseconds) {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor(milliseconds / 1000) % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function Dashboard() {
  const [telemetry, setTelemetry] = useState(null)
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [consumptionPeriod, setConsumptionPeriod] = useState('Daily')
  const [liveSamples, setLiveSamples] = useState([])
  const [flowHistory, setFlowHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jal-rakshak-telemetry-history') || '[]').filter(sample => Number.isFinite(Number(sample.flow))) } catch { return [] }
  })
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    const loadTelemetry = async () => {
      try {
        const response = await fetch(`${ESP32_API}/api/telemetry`)
        if (!response.ok) throw new Error('Device unavailable')
        const data = await response.json()
        if (active) {
          setTelemetry(data)
          setDeviceOnline(true)
          const sample = { ...data, flow: Number(data.flow ?? 0), receivedAt: new Date().toISOString() }
          setFlowHistory(samples => {
            const next = [...samples, sample].slice(-500)
            localStorage.setItem('jal-rakshak-telemetry-history', JSON.stringify(next))
            return next
          })
          setLiveSamples(samples => [...samples, { label: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), flow: sample.flow, value: Math.max(0, sample.flow / 6) }].slice(-12))
        }
      } catch { if (active) setDeviceOnline(false) }
    }
    loadTelemetry()
    const timer = setInterval(loadTelemetry, 10000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const tankLevel = telemetry?.tankLevel
  const ph = telemetry?.ph
  const tds = telemetry?.tds
  const turbidityVoltage = telemetry?.turbidityVoltage
  const liveFlow = telemetry?.flow
  const todayUsage = telemetry?.totalLitres
  const hour = currentTime.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const formattedTime = currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const formattedDate = currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
  const flowSettings = { ...defaultFlowSettings, ...(() => { try { return JSON.parse(localStorage.getItem('jal-rakshak-settings') || '{}') } catch { return {} } })() }
  const activeFlowSamples = flowHistory.filter(sample => Date.now() - new Date(sample.receivedAt).getTime() <= 24 * 60 * 60 * 1000)
  const flowStart = activeFlowSamples.find(sample => sample.flow > 0)
  const flowStop = activeFlowSamples.length && activeFlowSamples[activeFlowSamples.length - 1].flow <= 0 ? activeFlowSamples[activeFlowSamples.length - 1] : null
  const flowDuration = flowStart ? formatDuration(new Date((flowStop || activeFlowSamples[activeFlowSamples.length - 1]).receivedAt).getTime() - new Date(flowStart.receivedAt).getTime()) : '--'
  const currentFlowHour = currentTime.getHours()
  const leakageSamples = []
  for (let index = activeFlowSamples.length - 1; index >= 0; index -= 1) {
    const sample = activeFlowSamples[index]
    if (sample.flow >= flowSettings.leakMinFlow && sample.flow <= flowSettings.leakMaxFlow) leakageSamples.unshift(sample)
    else break
  }
  const leakageDuration = leakageSamples.length > 1 ? new Date(leakageSamples[leakageSamples.length - 1].receivedAt).getTime() - new Date(leakageSamples[0].receivedAt).getTime() : 0
  const possibleLeakage = leakageDuration >= flowSettings.leakDurationMinutes * 60000
  const unauthorizedSamples = []
  for (let index = activeFlowSamples.length - 1; index >= 0; index -= 1) {
    const sample = activeFlowSamples[index]
    if (sample.flow > flowSettings.unauthorizedFlowLimit) unauthorizedSamples.unshift(sample)
    else break
  }
  const unauthorizedDuration = unauthorizedSamples.length > 1 ? new Date(unauthorizedSamples[unauthorizedSamples.length - 1].receivedAt).getTime() - new Date(unauthorizedSamples[0].receivedAt).getTime() : 0
  const possibleUnauthorized = unauthorizedDuration >= flowSettings.unauthorizedDurationMinutes * 60000 && isRestrictedHour(currentFlowHour, flowSettings.restrictedStart, flowSettings.restrictedEnd)
  const normalUsage = telemetry && !possibleLeakage && !possibleUnauthorized && liveFlow >= flowSettings.normalMinFlow && liveFlow <= flowSettings.normalMaxFlow && !isRestrictedHour(currentFlowHour, flowSettings.restrictedStart, flowSettings.restrictedEnd)
  const flowStatus = possibleLeakage ? 'Possible Leakage' : possibleUnauthorized ? 'Possible Unauthorized Usage' : normalUsage ? 'Normal Water Usage' : telemetry ? 'Monitoring' : 'No Live Data'
  const selectedConsumption = consumptionPeriod === 'Hourly' && liveSamples.length > 0 ? { labels: liveSamples.map(sample => sample.label), values: liveSamples.map(sample => sample.value), unit: 'L/session' } : { labels: [], values: [], unit: '' }
  const consumptionTotal = selectedConsumption.values.reduce((total, value) => total + value, 0)
  const conditionAlerts = []
  if (telemetry) {
    if (ph < 6.5 || ph > 8.5) conditionAlerts.push({ title: 'Water quality abnormal', message: `pH is ${ph.toFixed(1)}, outside the 6.5-8.5 range.` })
    if (tds > 500) conditionAlerts.push({ title: 'High TDS detected', message: `TDS is ${tds.toFixed(0)} ppm.` })
    if (tankLevel < 20) conditionAlerts.push({ title: 'Low tank level', message: `Tank level is ${tankLevel.toFixed(0)}%.` })
    if (possibleUnauthorized) conditionAlerts.push({ title: 'Possible unauthorized water usage', message: `Flow is above ${flowSettings.unauthorizedFlowLimit} L/min during restricted hours.` })
    if (possibleLeakage) conditionAlerts.push({ title: 'Possible pipeline leakage', message: `Flow stayed between ${flowSettings.leakMinFlow} and ${flowSettings.leakMaxFlow} L/min for at least ${flowSettings.leakDurationMinutes} minutes.` })
  }

  return <main className="page">
    <div className="hero-row"><div><p className="eyebrow">LIVE SYSTEM OVERVIEW</p><h1>{greeting}</h1><p className="hero-copy">Your water network is healthy and running smoothly.</p></div><div className={deviceOnline ? 'sync' : 'sync offline'}><strong className="dashboard-time">{formattedTime}</strong><small className="dashboard-date">{formattedDate}</small><span><i className="pulse" /> {deviceOnline ? 'ESP32 connected' : 'Waiting for ESP32'}</span><small>{deviceOnline ? `Live from ${telemetry.deviceId}` : `Connect to ${ESP32_API}`}</small></div></div>
    <div className="stats-grid">
      <article className="stat-card"><div className="stat-icon blue"><Droplets /></div><div><span>Tank level</span><strong>{tankLevel == null ? '--' : `${tankLevel.toFixed(0)}%`}</strong><small><ArrowUpRight size={14} /> {deviceOnline ? 'Live ultrasonic reading' : 'No live data'}</small></div></article>
      <article className="stat-card"><div className="stat-icon orange"><Waves /></div><div><span>Today's usage</span><strong>{todayUsage == null ? '--' : todayUsage.toFixed(1)} <small>{todayUsage == null ? '' : 'L'}</small></strong><small><ArrowUpRight size={14} /> {deviceOnline ? 'Live flow total' : 'No live data'}</small></div></article>
      <article className="stat-card"><div className="stat-icon green"><Activity /></div><div><span>Water quality</span><strong>{ph == null ? '--' : ph >= 6.5 && ph <= 8.5 ? 'Good' : 'Check'}</strong><small><CheckCircle2 size={14} /> {ph == null || tds == null ? 'No live data' : `pH ${ph.toFixed(1)} · TDS ${tds.toFixed(0)}`}</small></div></article>
    </div>
    <section className="card flow-summary"><div><span>Current flow rate</span><strong>{liveFlow == null ? '--' : `${liveFlow.toFixed(1)} L/min`}</strong></div><div><span>Total water consumption</span><strong>{todayUsage == null ? '--' : `${todayUsage.toFixed(1)} L`}</strong></div><div><span>Flow duration</span><strong>{flowDuration}</strong></div><div><span>Flow started</span><strong>{flowStart ? new Date(flowStart.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--'}</strong></div><div><span>Flow stopped</span><strong>{flowStop ? new Date(flowStop.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : liveFlow > 0 ? 'Active' : '--'}</strong></div><div className="flow-status"><span>Current status</span><strong>{flowStatus}</strong></div></section>
    <div className="grid-two">
      <section className="card consumption"><div className="card-heading"><div><h2>Water Consumption</h2><p>{consumptionPeriod === 'Hourly' ? 'Today by hour' : consumptionPeriod === 'Daily' ? 'Last 7 days' : consumptionPeriod === 'Weekly' ? 'Last 4 weeks' : 'Last 6 months'}</p></div><div className="segmented">{consumptionPeriods.map(period => <button key={period} className={consumptionPeriod === period ? 'selected' : ''} onClick={() => setConsumptionPeriod(period)}>{period}</button>)}</div></div><div className="consumption-total"><strong>{selectedConsumption.values.length ? consumptionTotal.toLocaleString() : '--'}</strong> {selectedConsumption.unit} <span>{selectedConsumption.values.length ? <><ArrowDownRight size={15} /> Live</> : 'No live data'}</span></div><BarChart period={consumptionPeriod} labels={selectedConsumption.labels} values={selectedConsumption.values} /></section>
      <section className="card quality"><div className="card-heading"><div><h2>Water Quality</h2><p>Current sensor readings</p></div><div className="soft-icon"><Activity /></div></div><span className={ph != null && ph >= 6.5 && ph <= 8.5 ? 'status good' : 'status warning'}>{ph == null ? 'No Live Data' : ph >= 6.5 && ph <= 8.5 ? 'Quality Good' : 'Check Quality'}</span><div className="quality-row"><span>pH Level</span><strong>{ph == null ? '--' : ph.toFixed(1)}</strong><b>{ph == null ? '--' : 'Live'}</b></div><div className="ph-scale"><span className="ph-dot" style={{ left: ph == null ? '0%' : `${Math.min(100, Math.max(0, ph / 14 * 100))}%` }} /></div><div className="ph-labels"><span>Acidic (0)</span><span>Neutral (7)</span><span>Alkaline (14)</span></div><div className="quality-row tds"><span>TDS</span><strong>{tds == null ? '--' : tds.toFixed(0)} <small>{tds == null ? '' : 'ppm'}</small></strong></div><div className="quality-row tds"><span>Turbidity sensor</span><strong>{turbidityVoltage == null ? '--' : turbidityVoltage.toFixed(3)} <small>{turbidityVoltage == null ? '' : 'V'}</small></strong></div></section>
    </div>
    <section className="grid-two lower-grid"><section className="card alert-card"><div className="card-heading"><div><h2>Unauthorized Usage</h2><p>Restricted-hour monitoring</p></div><div className="soft-icon"><ShieldCheck /></div></div><span className={possibleUnauthorized ? 'status warning' : 'status good'}>{possibleUnauthorized ? 'Possible Unauthorized Usage' : 'No Alerts'}</span><p className={possibleUnauthorized ? 'warning-text' : 'alert-note'}>{possibleUnauthorized ? <><TriangleAlert size={17} /> High flow detected during restricted hours.</> : <><CheckCircle2 size={17} /> No abnormal restricted-hour usage.</>}</p></section><section className="card alert-card warning-card"><div className="card-heading"><div><h2>Leakage Detection</h2><p>Continuous low-flow monitoring</p></div><div className="soft-icon danger"><TriangleAlert /></div></div><span className={possibleLeakage ? 'status warning' : 'status good'}>{possibleLeakage ? 'Possible Leakage' : 'No Leakage'}</span><p className={possibleLeakage ? 'warning-text' : 'alert-note'}>{possibleLeakage ? <><TriangleAlert size={17} /> Small flow is continuously detected in the pipeline.</> : <><CheckCircle2 size={17} /> No continuous low-flow pattern detected.</>}</p></section></section>
    <section className="card condition-card"><div className="card-heading"><div><h2>Condition Analysis</h2><p>Live rule-based sensor checks</p></div><div className="soft-icon"><Activity /></div></div>{conditionAlerts.length ? conditionAlerts.map(alert => <p className="condition-item" key={alert.title}><TriangleAlert size={17} /><span><strong>{alert.title}</strong>{alert.message}</span></p>) : <p className="alert-note"><CheckCircle2 size={17} /> {telemetry ? 'No abnormal sensor readings detected.' : 'No live data available for analysis.'}</p>}<p className="condition-note"><ShieldCheck size={16} /> Possible water theft is inferred from sustained abnormal consumption, not physical access.</p></section>
    <div className="dashboard-secondary-grid"><section className="card flow-card"><div className="card-heading"><div><h2>Live Water Flow</h2><p>Current reading: {liveFlow == null ? '--' : `${liveFlow.toFixed(1)} L/min`}</p></div><span className="live"><i /> {deviceOnline ? 'Live' : 'No live data'}</span></div><FlowChart values={liveSamples.map(sample => sample.flow)} labels={liveSamples.map(sample => sample.label)} /></section>
    <section className="card tank-card"><div className="card-heading"><div><h2>Water Tank</h2><p>Main reservoir status</p></div><span className="trend">{deviceOnline ? 'Live' : 'No live data'}</span></div><div className="tank-ring"><div><Droplets size={32} /><strong>{tankLevel == null ? '--' : `${tankLevel.toFixed(0)}%`}</strong><span>Tank Level</span></div></div><div className="tank-metrics"><div><strong>--</strong><span>Capacity (L)</span></div><div><strong>--</strong><span>Current (L)</span></div></div></section></div>
  </main>
}

function Controls() {
  const [valve, setValve] = useState(true); const [motor, setMotor] = useState(false); const [auto, setAuto] = useState(true)
  return <main className="page"><div className="hero-row compact"><div><p className="eyebrow">REMOTE OPERATIONS</p><h1>System <em>controls</em></h1><p className="hero-copy">Manage your network hardware in real time.</p></div><div className="device-pill"><span className="pulse" /> Device JR-2024-001</div></div><section className={valve ? 'control-card valve-open' : 'control-card'}><div className="control-visual"><Power size={64} /></div><div className="control-content"><span className="eyebrow">PRIMARY VALVE</span><h2>Smart Gate Valve</h2><button className="big-state" onClick={() => setValve(!valve)}>{valve ? 'OPEN' : 'CLOSED'}</button><p>Last changed manually · 4 min ago</p></div><button className="outline-button" onClick={() => setValve(false)}><ShieldCheck size={18} /> Emergency Override</button><div className="simulate"><button>Simulate Theft</button><button>Simulate Bad Quality</button></div></section><section className="card motor-card"><div className="motor-icon"><Zap size={45} /></div><div><span className="eyebrow">AUTOMATION</span><h2>Smart Motor Control</h2><p>Starts at 20% tank level, stops at 100%</p><div className="toggle-row"><div><strong>Auto Mode</strong><small>Tank level automation</small></div><button className={auto ? 'toggle on' : 'toggle'} onClick={() => setAuto(!auto)}><i /></button></div><button className={motor ? 'primary-button active' : 'primary-button'} onClick={() => setMotor(!motor)}>{motor ? 'Stop Motor' : 'Start Motor'}</button></div></section></main>
}

function SettingsPage() {
  const [settings, setSettings] = useState(() => {
    try { return { daily: 5000, minPh: 6.5, maxPh: 10.3, notifications: true, qualityAlerts: true, lowWaterAlerts: true, dailyReports: false, emergency: true, ...defaultFlowSettings, ...JSON.parse(localStorage.getItem('jal-rakshak-settings') || '{}') } } catch { return { daily: 5000, minPh: 6.5, maxPh: 10.3, notifications: true, qualityAlerts: true, lowWaterAlerts: true, dailyReports: false, emergency: true, ...defaultFlowSettings } }
  })
  const [saved, setSaved] = useState(false)
  const updateSetting = (key, value) => setSettings(current => ({ ...current, [key]: value }))
  const saveSettings = () => { localStorage.setItem('jal-rakshak-settings', JSON.stringify(settings)); setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const Toggle = ({ value, setValue }) => <button className={value ? 'toggle on' : 'toggle'} onClick={() => setValue(!value)}><i /></button>
  return <main className="page settings-page"><div className="settings-top"><div className="settings-brand"><Logo /><div><h1>Settings</h1><p>Configure system parameters</p></div></div><button className="primary-button save" onClick={saveSettings}><Save size={18} /> {saved ? 'Saved' : 'Save Changes'}</button></div><section className="card settings-card"><SectionTitle icon={Gauge} title="Thresholds" subtitle="Set water usage and quality limits" /><div className="range-row"><div className="range-label"><span>Max Daily Water Limit</span><b>{settings.daily.toLocaleString()} L/day</b></div><input type="range" min="1000" max="20000" step="500" value={settings.daily} onChange={e => updateSetting('daily', Number(e.target.value))} /><div className="range-minmax"><span>1,000 L</span><span>20,000 L</span></div></div><div className="divider" /><div className="setting-label"><FlaskConical /><strong>Acceptable pH Range</strong></div><div className="ph-input"><label>Minimum pH Level <b>{settings.minPh.toFixed(1)}</b></label><input type="range" min="0" max="14" step="0.1" value={settings.minPh} onChange={e => updateSetting('minPh', Number(e.target.value))} /></div><div className="ph-input"><label>Maximum pH Level <b>{settings.maxPh.toFixed(1)}</b></label><input type="range" min="0" max="14" step="0.1" value={settings.maxPh} onChange={e => updateSetting('maxPh', Number(e.target.value))} /></div><div className="divider" /><div className="setting-label"><Waves /><strong>Flow detection</strong></div>{[['normalMinFlow', 'Normal minimum flow', 0, 50, 0.1, 'L/min'], ['normalMaxFlow', 'Normal maximum flow', 0, 100, 0.1, 'L/min'], ['leakMinFlow', 'Leak minimum flow', 0, 10, 0.1, 'L/min'], ['leakMaxFlow', 'Leak maximum flow', 0, 20, 0.1, 'L/min'], ['leakDurationMinutes', 'Leak duration', 1, 120, 1, 'minutes'], ['unauthorizedFlowLimit', 'Restricted-hour flow limit', 1, 200, 1, 'L/min'], ['unauthorizedDurationMinutes', 'Restricted-hour duration', 1, 120, 1, 'minutes']].map(([key, label, min, max, step, unit]) => <div className="ph-input" key={key}><label>{label} <b>{settings[key]} {unit}</b></label><input type="range" min={min} max={max} step={step} value={settings[key]} onChange={e => updateSetting(key, Number(e.target.value))} /></div>)}<div className="ph-input"><label>Restricted hours start <b>{settings.restrictedStart}:00</b></label><input type="range" min="0" max="23" step="1" value={settings.restrictedStart} onChange={e => updateSetting('restrictedStart', Number(e.target.value))} /></div><div className="ph-input"><label>Restricted hours end <b>{settings.restrictedEnd}:00</b></label><input type="range" min="0" max="23" step="1" value={settings.restrictedEnd} onChange={e => updateSetting('restrictedEnd', Number(e.target.value))} /></div><div className="info-note"><Activity size={17} /> Flow alerts use live ESP32 readings and the saved thresholds above.</div></section><section className="card settings-card"><SectionTitle icon={Bell} title="Notifications" subtitle="Configure alert preferences" />{[['Theft Alerts', 'Get notified of unauthorized access', 'notifications', ShieldCheck], ['Quality Alerts', 'Alerts for pH imbalance and high TDS', 'qualityAlerts', FlaskConical], ['Low Water Level Alerts', 'Notify when tank level is below 20%', 'lowWaterAlerts', Droplets], ['Daily Reports', 'Receive daily usage summary', 'dailyReports', Activity]].map(([title, text, key, Icon]) => <div className="notification-row" key={title}><Icon size={22} /><div><strong>{title}</strong><span>{text}</span></div><Toggle value={settings[key]} setValue={value => updateSetting(key, value)} /></div>)}</section><section className="card settings-card"><SectionTitle icon={Wifi} title="Device Settings" subtitle="Network and device configuration" /><label className="field-label"><Wifi size={20} /> Wi-Fi SSID<input value="JalRakshak_Network" readOnly /></label><label className="field-label"><SlidersHorizontal size={20} /> Device ID<input value="JR-2024-001" readOnly /><small>Unique identifier for your Jal Rakshak device</small></label></section><section className="card settings-card hardware"><SectionTitle icon={ShieldCheck} title="Hardware Control" subtitle="Safety and emergency settings" /><div className="notification-row"><Power size={22} /><div><strong>Automatic Emergency Shut-off</strong><span>Automatically close valve on theft or quality issues</span></div><Toggle value={settings.emergency} setValue={value => updateSetting('emergency', value)} /></div></section><footer>Jal Rakshak AI v1.0.0 · Last synced: {new Date().toLocaleString()}</footer></main>
}

function Login({ onSignIn }) {
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    onSignIn()
  }

  return <main className="login-screen">
    <section className="login-panel">
      <div className="login-logo"><Logo /></div>
      <h1>Jal Rakshak AI</h1>
      <p className="login-subtitle">Water Management System</p>
      <form onSubmit={submit}>
        <label className="login-field"><span>Email Address</span><div><Mail size={18} /><input type="email" placeholder="Enter your email" value={email} onChange={event => setEmail(event.target.value)} required /></div></label>
        <label className="login-field"><span>Password</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <div className="login-options"><label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> <span>Remember me</span></label><button type="button" className="text-link">Forgot password?</button></div>
        <button className="login-button" type="submit">Sign In</button>
      </form>
      <div className="login-divider" />
      <p className="create-account">Don't have an account? <button className="text-link" type="button">Create Account</button></p>
      <p className="login-footer"><Droplets size={14} /> Every drop counts. Save water, save life.</p>
    </section>
  </main>
}

export default function App() { const [page, setPage] = useState('dashboard'); const [authenticated, setAuthenticated] = useState(false); return authenticated ? <><Header page={page} setPage={setPage} onLogout={() => { setAuthenticated(false); setPage('dashboard') }} />{page === 'dashboard' && <Dashboard />}{page === 'controls' && <Controls />}{page === 'settings' && <SettingsPage />}</> : <Login onSignIn={() => setAuthenticated(true)} /> }
