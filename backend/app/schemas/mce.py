"""Inciso XIII — Memorial de Caracterização do Empreendimento (MCE, Anexo VII)."""
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, ValidationInfo, field_validator, model_validator
from app.schemas.validacoes import cnpj_valido, formatar_numero_br, mes_atual, numero_br, regerando_pdf, telefone_valido

SimNao = Literal["Sim", "Não"]

# Estrutura do Memorial de Caracterização do Empreendimento (MCE), na ordem e
# com os rótulos exatos do modelo oficial (Rev. 2 – 22/02/2024). Usada pelo
# gerador de PDF para montar as seções; cada item é (campo, rótulo).
# As observações de cada subseção são reproduzidas no PDF como no modelo.
MCE_ESTRUTURA: list[dict] = [
    {
        "titulo": "1. IDENTIFICAÇÃO DO EMPREENDIMENTO",
        "subsecoes": [
            {
                "titulo": "1.1. Dados Cadastrais",
                "campos": [
                    ("razao_social", "Razão Social"),
                    ("nome_fantasia", "Nome Fantasia"),
                    ("cnpj", "CNPJ"),
                    ("inscricao_estadual", "Inscrição Estadual"),
                    ("endereco", "Endereço Completo"),
                    ("cep", "CEP"),
                    ("telefone", "Telefone"),
                    ("email", "E-mail"),
                    ("responsavel_nome", "Nome do Responsável"),
                    ("responsavel_cargo", "Cargo do Responsável"),
                ],
            },
            {
                "titulo": "1.2. Natureza do Empreendimento",
                "campos": [
                    ("cnae_principal", "CNAE Principal"),
                    ("atividade_principal", "Descrição da Atividade Principal"),
                    ("cnaes_secundarios", "CNAEs Secundários"),
                    ("atividades_secundarias", "Descrição das Atividades Secundárias"),
                ],
            },
            {
                "titulo": "1.3. Situação do Empreendimento",
                "campos": [
                    ("em_implantacao", "Empreendimento em Implantação"),
                    ("previsao_funcionamento", "Previsão para entrar em Funcionamento"),
                    ("ja_implantado", "Empreendimento Já Implantado"),
                    ("data_inicio_operacoes", "Data de Início das Operações"),
                    ("licencas_ambientais_situacao", "Licenças Ambientais"),
                ],
            },
            {
                "titulo": "1.4. Caracterização da Área",
                "campos": [
                    ("area_total_terreno", "Área Total do Terreno"),
                    ("area_construida", "Área Construída"),
                    ("area_verde", "Área Verde"),
                    ("percentual_area_verde", "Percentual de Área Verde"),
                    ("uso_solo", "Uso do Solo (Zoneamento)"),
                    ("topografia", "Topografia"),
                    ("vegetacao", "Vegetação"),
                    ("hidrografia", "Hidrografia"),
                ],
                "observacao_titulo": "Observação Importante:",
                "observacao": [
                    "Apresentar documentos ou projeto que comprovem a destinação de no mínimo 20% do "
                    "espaço para áreas verdes, conforme exigido pelo Anexo V - Exigências Técnicas do "
                    "Projeto de Ocupação de Área (POA) e Anexo VII - Exigências Técnicas do Memorial de "
                    "Caracterização de Empreendimentos de Critérios de Avaliação, presente no Regulamento "
                    "de Alienações de Áreas e Empreendimentos da CODEGO.",
                ],
            },
            {
                "titulo": "1.5. Mão de Obra",
                "campos": [
                    ("mao_obra_escritorio", "Escritório"),
                    ("mao_obra_industria", "Indústria"),
                    ("mao_obra_externos", "Externos"),
                    ("mao_obra_outros", "Outros"),
                    ("mao_obra_total", "Total"),
                ],
            },
            {
                "titulo": "1.6. Jornada de Trabalho",
                "campos": [
                    ("horario_funcionamento", "Horário de Funcionamento"),
                    ("dias_semana", "Dias da Semana"),
                    ("numero_turnos", "Número de Turnos"),
                ],
            },
            {
                "titulo": "1.7. Diversificação e Ampliação",
                "campos": [
                    ("previsao_diversificacao", "Previsão de Diversificação das Atividades"),
                    ("novas_atividades", "Descrição das Novas Atividades (se houver)"),
                    ("previsao_ampliacao", "Previsão de Ampliação da Produção"),
                    ("percentual_ampliacao", "Percentual de Ampliação Prevista (se houver)"),
                ],
            },
        ],
    },
    {
        "titulo": "2. INSUMOS E PRODUTOS",
        "subsecoes": [
            {
                "titulo": "2.1. Matérias-primas",
                "campos": [
                    ("mp_descricao", "Descrição"),
                    ("mp_quantidade_diaria", "Quantidade Diária"),
                    ("mp_unidade", "Unidade de Medida"),
                    ("mp_origem", "Origem"),
                    ("mp_armazenamento", "Forma de Armazenamento"),
                ],
            },
            {
                "titulo": "2.2. Produtos Fabricados",
                "campos": [
                    ("pf_descricao", "Descrição"),
                    ("pf_quantidade_diaria", "Quantidade Diária"),
                    ("pf_unidade", "Unidade de Medida"),
                    ("pf_destino", "Destino"),
                    ("pf_armazenamento", "Forma de Armazenamento"),
                ],
            },
            {
                "titulo": (
                    "2.3. Caracterização do Fluxo produtivo: Fluxograma Geral dos Processos e/ou "
                    "Descrição dos Processos Produtivos"
                ),
                "campos": [
                    ("fluxograma", "Fluxograma Geral dos Processos"),
                    ("processos_produtivos", "Descrição dos Processos Produtivos"),
                ],
                "observacao_titulo": "Observação – Casos Específicos:",
                "observacao": [
                    "Para unidades químicas: É necessário o envio das FISPQ/MSDS de todas as "
                    "matérias-primas e produtos finais usados.",
                    "Empreendimentos de explosivos/produtos controlados: Apresentar registro no "
                    "Ministério do Exército, alvará de controle de armas e munição e certificado de "
                    "aprovação do Corpo de Bombeiros (atualizado).",
                    "Empreendimentos com produtos combustíveis e inflamáveis: Necessário certificado de "
                    "aprovação do Corpo de Bombeiros (atualizado).",
                    "Empreendimentos que usam lenha como combustível: Exigido cadastro de consumidor de lenha.",
                ],
            },
        ],
    },
    {
        "titulo": "3. CONSUMO DE RECURSOS",
        "subsecoes": [
            {
                "titulo": "3.1. Água",
                "campos": [
                    ("agua_consumo_mensal", "Consumo Mensal"),
                    ("agua_origem", "Origem"),
                    ("agua_finalidade", "Finalidade"),
                    ("agua_tratamento", "Sistema de Tratamento de Água"),
                ],
                "observacao_titulo": "Observação:",
                "observacao": [
                    "Caso a fonte de abastecimento seja alternativa, de não fornecimento desta Companhia, "
                    "o empreendimento deverá informar e apresentar outorga ou dispensa de outorga da mesma.",
                ],
            },
            {
                "titulo": "3.2. Energia Elétrica",
                "campos": [
                    ("energia_consumo_diario", "Consumo Diário"),
                    ("energia_unidade", "Unidade de Medida"),
                    ("energia_tensao", "Tensão"),
                    ("energia_finalidade", "Finalidade"),
                    ("energia_equipamentos", "Relação de Equipamentos"),
                ],
            },
            {
                "titulo": "3.3. Combustíveis",
                "campos": [
                    ("combustivel_tipo", "Tipo de Combustível"),
                    ("combustivel_consumo_diario", "Consumo Diário"),
                    ("combustivel_unidade", "Unidade de Medida"),
                    ("combustivel_finalidade", "Finalidade"),
                ],
            },
            {
                "titulo": "3.4. Outros Recursos",
                "campos": [
                    ("outros_recursos_descricao", "Descrição"),
                    ("outros_recursos_consumo_diario", "Consumo Diário"),
                    ("outros_recursos_unidade", "Unidade de Medida"),
                    ("outros_recursos_finalidade", "Finalidade"),
                ],
            },
        ],
    },
    {
        # O modelo oficial numera esta seção como "3." por engano (as subseções
        # são 4.x); aqui usamos a numeração correta.
        "titulo": "4. GERAÇÃO DE RESÍDUOS",
        "subsecoes": [
            {
                "titulo": "4.1. Resíduos Sólidos",
                "campos": [
                    ("rs_classe", "Classe"),
                    ("rs_descricao", "Descrição"),
                    ("rs_quantidade_diaria", "Quantidade Diária"),
                    ("rs_unidade", "Unidade de Medida"),
                    ("rs_quantidade_recuperada", "Quantidade Recuperada (diária)"),
                    ("rs_irr", "IRR (quantidade gerada ÷ quantidade recuperada)"),
                    ("rs_armazenamento", "Forma de Armazenamento"),
                    ("rs_destino_final", "Destino Final"),
                    ("rs_licenca_transporte", "Licença de Operação da Empresa de Transporte"),
                ],
            },
            {
                "titulo": "4.2. Resíduos Líquidos",
                "campos": [
                    ("rl_vazao_diaria", "Vazão Diária"),
                    ("rl_unidade", "Unidade de Medida"),
                    ("rl_origem", "Origem"),
                    ("rl_caracterizacao", "Caracterização"),
                    ("rl_tratamento", "Forma de Tratamento"),
                    ("rl_destino_final", "Destino Final"),
                    ("rl_licenca_ete", "Licença de Operação da Estação de Tratamento"),
                ],
                "observacao_titulo": "Observação Importante:",
                "observacao": [
                    "- Em caso do Distrito não possuir Estação de Tratamento de Esgoto, informar qual "
                    "solução de esgotamento sanitário o empreendimento irá adotar;",
                    "- Se a empresa optar por implementar uma Estação de Tratamento de Esgoto (ETE), "
                    "deverá submeter o respectivo projeto a esta Gerência para avaliação e deliberações "
                    "pertinentes. É imprescindível que o projeto da ETE inclua a Anotação de "
                    "Responsabilidade Técnica (ART).",
                ],
            },
            {
                "titulo": "4.3. Emissões Atmosféricas",
                "campos": [
                    ("ea_descricao", "Descrição"),
                    ("ea_quantidade_diaria", "Quantidade Diária"),
                    ("ea_unidade", "Unidade de Medida"),
                    ("ea_ponto_emissao", "Ponto de Emissão"),
                    ("ea_controle", "Controle de Poluição"),
                    ("ea_monitoramento", "Monitoramento"),
                ],
            },
        ],
    },
    {
        "titulo": "5. CONTROLE AMBIENTAL",
        "subsecoes": [
            {
                "titulo": "5.1. Licenças Ambientais",
                "campos": [
                    ("licenca_municipal", "Licença Municipal"),
                    ("licenca_estadual", "Licença Estadual"),
                    ("licenca_federal", "Licença Federal"),
                ],
                "observacao_titulo": "Observação Importante:",
                "observacao": [
                    "Quando o empreendimento se encontrar em etapa de regularização, conforme o andamento "
                    "deverá apresentar as devidas licenças.",
                ],
            },
            {
                "titulo": "5.2. Plano de Controle Ambiental (PCA)",
                "campos": [
                    ("pca", "Plano de Controle Ambiental"),
                    ("pca_data_revisao", "Data da Última Revisão"),
                ],
            },
            {
                "titulo": "5.3. Monitoramento Ambiental",
                "campos": [
                    ("monitoramento_agua", "Monitoramento de Água"),
                    ("monitoramento_ar", "Monitoramento de Ar"),
                    ("monitoramento_ruido", "Monitoramento de Ruído"),
                    ("monitoramento_ruido_descricao", "Equipamentos, horários e estratégias de controle de ruído"),
                    ("monitoramento_outros", "Outros"),
                ],
            },
        ],
    },
]


class MceIn(BaseModel):
    # 1.1. Dados Cadastrais
    razao_social: str
    nome_fantasia: str = ""
    cnpj: str
    inscricao_estadual: str
    endereco: str
    cep: str
    telefone: str
    email: EmailStr
    responsavel_nome: str
    responsavel_cargo: str

    # 1.2. Natureza do Empreendimento
    cnae_principal: str
    atividade_principal: str
    cnaes_secundarios: str = ""
    atividades_secundarias: str = ""

    # 1.3. Situação do Empreendimento
    em_implantacao: SimNao
    previsao_funcionamento: str = ""
    ja_implantado: SimNao
    data_inicio_operacoes: str = ""
    licencas_ambientais_situacao: str = ""

    # 1.4. Caracterização da Área
    area_total_terreno: str
    area_construida: str = ""
    area_verde: str = ""
    # Calculado a partir da área verde e da área total (o que vier do front-end
    # é ignorado).
    percentual_area_verde: str = ""
    uso_solo: str = ""
    topografia: str = ""
    vegetacao: str = ""
    hidrografia: str = ""

    # 1.5. Mão de Obra (o total é calculado a partir dos demais)
    mao_obra_escritorio: int = 0
    mao_obra_industria: int = 0
    mao_obra_externos: int = 0
    mao_obra_outros: int = 0

    # 1.6. Jornada de Trabalho
    horario_funcionamento: str = ""
    dias_semana: str = ""
    numero_turnos: str = ""

    # 1.7. Diversificação e Ampliação
    previsao_diversificacao: SimNao
    novas_atividades: str = ""
    previsao_ampliacao: SimNao
    percentual_ampliacao: str = ""

    # 2.1. Matérias-primas
    mp_descricao: str = ""
    mp_quantidade_diaria: str = ""
    mp_unidade: str = ""
    mp_origem: str = ""
    mp_armazenamento: str = ""

    # 2.2. Produtos Fabricados
    pf_descricao: str = ""
    pf_quantidade_diaria: str = ""
    pf_unidade: str = ""
    pf_destino: str = ""
    pf_armazenamento: str = ""

    # 2.3. Fluxo produtivo
    fluxograma: str = ""
    processos_produtivos: str = ""

    # 3.1. Água
    agua_consumo_mensal: str = ""
    agua_origem: str = ""
    agua_finalidade: str = ""
    agua_tratamento: str = ""

    # 3.2. Energia Elétrica
    energia_consumo_diario: str = ""
    energia_unidade: str = ""
    energia_tensao: str = ""
    energia_finalidade: str = ""
    energia_equipamentos: str = ""

    # 3.3. Combustíveis
    combustivel_tipo: str = ""
    combustivel_consumo_diario: str = ""
    combustivel_unidade: str = ""
    combustivel_finalidade: str = ""

    # 3.4. Outros Recursos
    outros_recursos_descricao: str = ""
    outros_recursos_consumo_diario: str = ""
    outros_recursos_unidade: str = ""
    outros_recursos_finalidade: str = ""

    # 4.1. Resíduos Sólidos
    rs_classe: str = ""
    rs_descricao: str = ""
    rs_quantidade_diaria: str = ""
    rs_quantidade_recuperada: str = ""  # mesma unidade da quantidade diária
    rs_irr: str = ""  # calculado: quantidade gerada ÷ quantidade recuperada
    rs_unidade: str = ""
    rs_armazenamento: str = ""
    rs_destino_final: str = ""
    rs_licenca_transporte: str = ""

    # 4.2. Resíduos Líquidos
    rl_vazao_diaria: str = ""
    rl_unidade: str = ""
    rl_origem: str = ""
    rl_caracterizacao: str = ""
    rl_tratamento: str = ""
    rl_destino_final: str = ""
    rl_licenca_ete: str = ""

    # 4.3. Emissões Atmosféricas
    ea_descricao: str = ""
    ea_quantidade_diaria: str = ""
    ea_unidade: str = ""
    ea_ponto_emissao: str = ""
    ea_controle: str = ""
    ea_monitoramento: str = ""

    # 5.1. Licenças Ambientais
    licenca_municipal: str = ""
    licenca_estadual: str = ""
    licenca_federal: str = ""

    # 5.2. Plano de Controle Ambiental
    pca: SimNao
    pca_data_revisao: str = ""

    # 5.3. Monitoramento Ambiental
    monitoramento_agua: SimNao
    monitoramento_ar: SimNao
    monitoramento_ruido: SimNao
    monitoramento_ruido_descricao: str = ""
    monitoramento_outros: SimNao

    # 6. Declaração
    local_cidade_uf: str


    @property
    def mao_obra_total(self) -> int:
        return (
            self.mao_obra_escritorio
            + self.mao_obra_industria
            + self.mao_obra_externos
            + self.mao_obra_outros
        )

    @field_validator(
        "razao_social",
        "inscricao_estadual",
        "endereco",
        "responsavel_nome",
        "responsavel_cargo",
        "cnae_principal",
        "atividade_principal",
        "area_total_terreno",
        "local_cidade_uf",
    )
    @classmethod
    def campo_nao_vazio(cls, v: str, info):
        if not v or not v.strip():
            raise ValueError(f"O campo '{info.field_name}' é obrigatório.")
        return v.strip()

    @field_validator("cnpj")
    @classmethod
    def valida_cnpj(cls, v: str):
        digits = "".join(filter(str.isdigit, v))
        if len(digits) != 14:
            raise ValueError("CNPJ deve ter 14 dígitos.")
        if not cnpj_valido(digits):
            raise ValueError("CNPJ inválido. Confira os números digitados.")
        return digits

    @field_validator("cep")
    @classmethod
    def valida_cep(cls, v: str):
        digits = "".join(filter(str.isdigit, v))
        if len(digits) != 8:
            raise ValueError("CEP deve ter 8 dígitos.")
        return digits

    @field_validator("telefone")
    @classmethod
    def valida_telefone(cls, v: str):
        digits = "".join(filter(str.isdigit, v))
        if not telefone_valido(digits):
            raise ValueError("Telefone deve ter DDD + número: 10 dígitos (fixo) ou 11 (celular).")
        return digits

    @field_validator("mao_obra_escritorio", "mao_obra_industria", "mao_obra_externos", "mao_obra_outros")
    @classmethod
    def valida_mao_obra(cls, v: int):
        if v < 0:
            raise ValueError("A quantidade de funcionários não pode ser negativa.")
        return v

    @field_validator("area_total_terreno", "area_construida", "area_verde")
    @classmethod
    def valida_area(cls, v: str, info):
        rotulos = {
            "area_total_terreno": "Área Total do Terreno",
            "area_construida": "Área Construída",
            "area_verde": "Área Verde",
        }
        if not (v or "").strip():
            return ""
        try:
            valor = numero_br(v)
        except ValueError as exc:
            raise ValueError(f"{rotulos[info.field_name]}: {exc}") from exc
        if valor <= 0 and info.field_name == "area_total_terreno":
            raise ValueError("A Área Total do Terreno deve ser maior que zero.")
        return formatar_numero_br(valor)

    @field_validator("previsao_funcionamento")
    @classmethod
    def valida_previsao_funcionamento(cls, v: str, info: ValidationInfo):
        if not (v or "").strip():
            return ""
        if not re.fullmatch(r"\d{4}-\d{2}", v) or not 1 <= int(v[5:]) <= 12:
            raise ValueError("Previsão para entrar em Funcionamento: use o formato AAAA-MM.")
        if v < mes_atual() and not regerando_pdf(info):
            raise ValueError("A previsão para entrar em funcionamento não pode ser um mês que já passou.")
        return v

    @field_validator("data_inicio_operacoes", "pca_data_revisao")
    @classmethod
    def valida_data_passada(cls, v: str, info):
        rotulo = "Data de Início das Operações" if info.field_name == "data_inicio_operacoes" else "Data da Última Revisão do PCA"
        if not (v or "").strip():
            return ""
        try:
            data = date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError(f"{rotulo}: use o formato AAAA-MM-DD.") from exc
        if data > date.today():
            raise ValueError(f"A {rotulo} não pode ser no futuro.")
        return v

    @model_validator(mode="after")
    def valida_coerencia(self):
        # Situação: ou está em implantação ou já está implantado.
        if self.em_implantacao == self.ja_implantado:
            raise ValueError(
                "Informe se o empreendimento está em implantação ou se já está implantado "
                "(apenas uma das opções)."
            )
        # Só vale o campo da situação escolhida.
        if self.em_implantacao == "Sim":
            self.data_inicio_operacoes = ""
        else:
            self.previsao_funcionamento = ""
        if self.pca == "Não":
            self.pca_data_revisao = ""

        # Áreas: construída e verde cabem na área total; o percentual é calculado.
        total = numero_br(self.area_total_terreno)
        for campo, rotulo in (("area_construida", "área construída"), ("area_verde", "área verde")):
            valor = getattr(self, campo)
            if valor and numero_br(valor) > total:
                raise ValueError(f"A {rotulo} não pode ser maior que a área total do terreno.")
        if self.area_verde:
            percentual = numero_br(self.area_verde) / total * 100
            self.percentual_area_verde = f"{percentual:.1f}%".replace(".", ",")
        else:
            self.percentual_area_verde = ""

        # IRR dos resíduos sólidos: quantidade gerada ÷ quantidade recuperada.
        self.rs_irr = ""
        if self.rs_quantidade_recuperada:
            try:
                recuperada = numero_br(self.rs_quantidade_recuperada)
            except ValueError as exc:
                raise ValueError(f"Quantidade Recuperada: {exc}") from exc
            try:
                gerada = numero_br(self.rs_quantidade_diaria)
            except ValueError as exc:
                raise ValueError(
                    "Para calcular o IRR, informe a Quantidade Diária de resíduos sólidos só com números (ex.: 120 ou 85,5)."
                ) from exc
            if recuperada > gerada:
                raise ValueError("A quantidade recuperada não pode ser maior que a quantidade diária gerada.")
            self.rs_quantidade_recuperada = formatar_numero_br(recuperada)
            self.rs_irr = (
                "Não se aplica (nada é recuperado)" if recuperada == 0
                else f"{gerada / recuperada:.2f}".replace(".", ",")
            )
        return self

    @model_validator(mode="after")
    def valida_ruido(self):
        # O modelo exige, quando há monitoramento de ruído, a relação dos
        # equipamentos/horários e as estratégias de controle.
        if self.monitoramento_ruido == "Sim" and not self.monitoramento_ruido_descricao.strip():
            raise ValueError(
                "Descreva os equipamentos que produzem ruídos, seus horários de operação e as "
                "estratégias de controle quando houver monitoramento de ruído."
            )
        return self
