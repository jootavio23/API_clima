
// 1. CONFIGURAÇÕES E ESTADO GLOBAL
const OPENWEATHER_API_KEY = "19f36673fa3c1bf0395766b1d1a84ff8";
const MQTT_BROKER = "ws://broker.hivemq.com:8000/mqtt";

const TOPICS = {
  TEMPERATURA: "esp32/clima/temperatura",
  UMIDADE: "esp32/clima/umidade",
  CIDADE_ATUAL: "esp32/clima/cidadeAtual",
  CIDADE: "esp32/clima/cidade"
};

let chartInstance = null;
let mqttClient = null;

// =====================================================
// 2. INICIALIZAÇÃO
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  feather.replace();
  initTheme();
  initChart();
  initMQTT();
  loadFavorites();
  setupEventListeners();
});

// =====================================================
// 3. LISTENERS E EVENTOS (ETAPAS 7, 11, 12)
// =====================================================
function setupEventListeners() {
  document.getElementById("aplicar").addEventListener("click", executarConsulta);
 
  // Tecla Enter para busca (Etapa 7)
  document.getElementById("cidade").addEventListener("keydown", (e) => {
    if (e.key === "Enter") executarConsulta();
  });

  // Alternar Tema (Etapa 12)
  document.getElementById("toggleTheme").addEventListener("click", toggleTheme);

  // Favoritar Cidade (Etapa 11)
  document.getElementById("btnFavorito").addEventListener("click", salvarFavorito);
}

// =====================================================
// 4. CONSULTA A API E TRATAMENTO DE ERROS (ETAPAS 4, 8, 9)
// =====================================================
async function executarConsulta() {
  const cidade = document.getElementById("cidade").value.trim();
  const pais = document.getElementById("pais").value.trim();

  // Tratamento de Campo Vazio (Etapa 8)
  if (!cidade) {
    exibirMensagem("⚠️ Por favor, informe o nome de uma cidade.", "red");
    return;
  }

  mostrarCarregamento(true);
  limparMensagem();

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade)},${encodeURIComponent(pais)}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
   
    const resposta = await fetch(url);

    // Tratamento de Erros de API (Etapa 8)
    if (!resposta.ok) {
      if (resposta.status === 404) {
        throw new Error("Cidade não encontrada. Verifique o nome e tente novamente.");
      } else if (resposta.status === 401) {
        throw new Error("API Key inválida ou não ativada.");
      } else {
        throw new Error("Erro ao consultar serviço meteorológico.");
      }
    }

    const dados = await resposta.json();

    // Atualizações de Interface e Módulos
    atualizarInterface(dados, pais);
    atualizarGrafico(dados.main.temp, dados.main.humidity);
    publicarMQTT(dados.main.temp, dados.main.humidity, `${dados.name}, ${pais}`);
    adicionarAoHistorico(dados.name, dados.main.temp, dados.main.humidity);
    verificarAlertasClimaticos(dados.main.temp); // Funcionalidade Própria

    exibirMensagem(`✅ Clima de ${dados.name} atualizado!`, "green");
  } catch (erro) {
    // Tratamento de Erro de Conexão (Etapa 8)
    const msg = navigator.onLine ? erro.message : "Sem conexão com a internet.";
    exibirMensagem(`❌ ${msg}`, "red");
  } finally {
    mostrarCarregamento(false);
  }
}

// =====================================================
// 5. ATUALIZAÇÃO DA INTERFACE (ETAPAS 3, 4, 6)
// =====================================================
function atualizarInterface(dados, pais) {
  document.getElementById("cidadeAtual").textContent = `${dados.name}, ${pais}`;
  document.getElementById("temp").textContent = `${Math.round(dados.main.temp)} °C`;
  document.getElementById("feelsLike").textContent = `${Math.round(dados.main.feels_like)} °C`;
  document.getElementById("hum").textContent = `${dados.main.humidity} %`;
  document.getElementById("pressure").textContent = `${dados.main.pressure} hPa`;
  document.getElementById("windSpeed").textContent = `${(dados.wind.speed * 3.6).toFixed(1)} km/h`;
  document.getElementById("weatherDesc").textContent = dados.weather[0].description;
 
  document.getElementById("tempMinMax").textContent =
    `${Math.round(dados.main.temp_min)}°C / ${Math.round(dados.main.temp_max)}°C`;

  // Formatação de Horários do Sol
  const formatarHora = (timestamp) => new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById("sunrise").textContent = formatarHora(dados.sys.sunrise);
  document.getElementById("sunset").textContent = formatarHora(dados.sys.sunset);

  // Data e Horário da Atualização (Etapa 6)
  const agora = new Date();
  document.getElementById("lastUpdate").textContent = `${agora.toLocaleDateString()} às ${agora.toLocaleTimeString()}`;
}

// =====================================================
// 6. FUNCIONALIDADE PRÓPRIA (ETAPA 16 - ALERTA CLIMÁTICO)
// =====================================================
function verificarAlertasClimaticos(temp) {
  const alertEl = document.getElementById("weatherAlert");
  alertEl.className = "alert-box";
 
  if (temp >= 32) {
    alertEl.classList.remove("hidden");
    alertEl.classList.add("alert-danger");
    alertEl.innerHTML = "🔥 <b>Alerta de Temperatura Elevada!</b> Mantenha-se hidratado e evite exposição direta ao sol.";
  } else if (temp <= 10) {
    alertEl.classList.remove("hidden");
    alertEl.classList.add("alert-warning");
    alertEl.innerHTML = "❄️ <b>Alerta de Frio Intenso!</b> Mantenha-se agasalhado.";
  } else {
    alertEl.classList.add("hidden");
  }
}

// =====================================================
// 7. GRÁFICO MELHORADO (ETAPA 5)
// =====================================================
function initChart() {
  const ctx = document.getElementById("chart").getContext("2d");
 
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperatura (°C)",
          data: [],
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.2)",
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
          yAxisID: "y" // Eixo Y Principal (Temperatura)
        },
        {
          label: "Umidade (%)",
          data: [],
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.2)",
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
          yAxisID: "y1" // Eixo Y Secundário (Umidade)
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      scales: {
        x: {
          title: { display: true, text: "Horário da Consulta" }
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: { display: true, text: "Temperatura (°C)" },
          suggestedMin: 0,
          suggestedMax: 40
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: { display: true, text: "Umidade (%)" },
          suggestedMin: 0,
          suggestedMax: 100,
          grid: {
            drawOnChartArea: false // Evita poluição de linhas de grade duplas
          }
        }
      }
    }
  });
}

// Função única e sincronizada para inserir dados no gráfico
function atualizarGrafico(temp, umidade) {
  if (!chartInstance) return;

  const hora = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // Insere um único rótulo de tempo para ambos os dados
  chartInstance.data.labels.push(hora);
  chartInstance.data.datasets[0].data.push(parseFloat(temp));
  chartInstance.data.datasets[1].data.push(parseFloat(umidade));

  // Limite máximo de 15 pontos no gráfico para manter a visualização limpa
  if (chartInstance.data.labels.length > 15) {
    chartInstance.data.labels.shift();
    chartInstance.data.datasets[0].data.shift();
    chartInstance.data.datasets[1].data.shift();
  }

  chartInstance.update();
}

// =====================================================
// 9. TRATAMENTO MQTT SINCRONIZADO
// =====================================================
let ultimaTempMQTT = null;

function initMQTT() {
  mqttClient = mqtt.connect(MQTT_BROKER);

  mqttClient.on("connect", () => {
    const el = document.getElementById("mqttStatus");
    el.textContent = "Conectado";
    el.className = "status-online";

    mqttClient.subscribe(TOPICS.TEMPERATURA);
    mqttClient.subscribe(TOPICS.UMIDADE);
    mqttClient.subscribe(TOPICS.CIDADE_ATUAL);
  });

  mqttClient.on("message", (topic, message) => {
    const txt = message.toString();

    if (topic === TOPICS.TEMPERATURA) {
      ultimaTempMQTT = parseFloat(txt);
      document.getElementById("temp").textContent = `${ultimaTempMQTT} °C`;
    }

    if (topic === TOPICS.UMIDADE) {
      const umidade = parseFloat(txt);
      document.getElementById("hum").textContent = `${umidade} %`;

      // Atualiza o gráfico apenas quando ambos os valores tiverem chegado do MQTT
      if (ultimaTempMQTT !== null) {
        atualizarGrafico(ultimaTempMQTT, umidade);
        ultimaTempMQTT = null;
      }
    }

    if (topic === TOPICS.CIDADE_ATUAL) {
      document.getElementById("cidadeAtual").textContent = txt;
    }
  });

  mqttClient.on("error", () => {
    const el = document.getElementById("mqttStatus");
    el.textContent = "Erro";
    el.className = "status-offline";
  });
}

// =====================================================
// 8. HISTÓRICO E FAVORITOS (ETAPAS 10, 11)
// =====================================================
function adicionarAoHistorico(cidade, temp, hum) {
  const lista = document.getElementById("listaHistorico");
  const item = document.createElement("li");
  item.className = "list-item";
  item.innerHTML = `<span><b>${cidade}</b></span> <span>${Math.round(temp)}°C | ${hum}%</span>`;
 
  lista.insertBefore(item, lista.firstChild);
  if (lista.children.length > 5) lista.removeChild(lista.lastChild);
}

function salvarFavorito() {
  const cidade = document.getElementById("cidade").value.trim();
  const pais = document.getElementById("pais").value.trim();

  if (!cidade) return;

  const favorito = { cidade, pais };
  localStorage.setItem("cidadeFavorita", JSON.stringify(favorito));
  loadFavorites();
  exibirMensagem("⭐ Cidade salva nos favoritos!", "green");
}

function loadFavorites() {
  const favData = localStorage.getItem("cidadeFavorita");
  const container = document.getElementById("cidadeFavoritaContainer");

  if (favData) {
    const { cidade, pais } = JSON.parse(favData);
    container.innerHTML = `
      <div class="list-item">
        <span><b>${cidade} (${pais})</b></span>
        <button onclick="carregarFavorito('${cidade}', '${pais}')" class="btn-secondary">Consultar</button>
      </div>`;
  }
}

function carregarFavorito(cidade, pais) {
  document.getElementById("cidade").value = cidade;
  document.getElementById("pais").value = pais;
  executarConsulta();
}

// =====================================================
// 9. CONEXÃO MQTT
// =====================================================
function initMQTT() {
  mqttClient = mqtt.connect(MQTT_BROKER);

  mqttClient.on("connect", () => {
    const el = document.getElementById("mqttStatus");
    el.textContent = "Conectado";
    el.className = "status-online";
  });

  mqttClient.on("error", () => {
    const el = document.getElementById("mqttStatus");
    el.textContent = "Erro";
    el.className = "status-offline";
  });
}

function publicarMQTT(temp, hum, cidade) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(TOPICS.TEMPERATURA, temp.toString());
    mqttClient.publish(TOPICS.UMIDADE, hum.toString());
    mqttClient.publish(TOPICS.CIDADE_ATUAL, cidade);
  }
}

// =====================================================
// 10. TEMAS, UTILITÁRIOS E MENSAGENS (ETAPA 12)
// =====================================================
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light-mode";
  document.body.className = savedTheme;
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const newTheme = document.body.classList.contains("dark-mode") ? "light-mode" : "dark-mode";
  document.body.className = newTheme;
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("themeIcon");
  if (theme === "dark-mode") {
    icon.setAttribute("data-feather", "sun");
  } else {
    icon.setAttribute("data-feather", "moon");
  }
  feather.replace();
}

function mostrarCarregamento(exibir) {
  document.getElementById("loading").classList.toggle("hidden", !exibir);
}

function exibirMensagem(texto, cor) {
  const el = document.getElementById("mensagem");
  el.textContent = texto;
  el.style.color = cor === "green" ? "#2e7d32" : "#c62828";
}

function limparMensagem() {
  document.getElementById("mensagem").textContent = "";
}
