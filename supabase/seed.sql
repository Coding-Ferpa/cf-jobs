-- Seed das taxonomias (doc 04).
--
-- Rodado por `supabase db reset` em desenvolvimento e no CI. Os slugs são
-- contrato: aparecem na URL dos filtros e são o alvo do mapeamento da IA, então
-- mudá-los quebra links e importações antigas.
--
-- `aliases` é o que a IA consulta quando o termo extraído da vaga não bate com
-- o slug — por isso inclui abreviações, grafias em inglês e erros comuns.

-- ---------------------------------------------------------------------------
-- Modalidades de trabalho
-- ---------------------------------------------------------------------------

insert into public.work_modes (slug, label, aliases, sort_order) values
  ('remoto', 'Remoto', '{remote,home office,home-office,anywhere,teletrabalho,100% remoto}', 1),
  ('hibrido', 'Híbrido', '{hybrid,semipresencial,semi-presencial,flexivel}', 2),
  ('presencial', 'Presencial', '{on-site,onsite,no escritorio,in office}', 3);

-- ---------------------------------------------------------------------------
-- Tipos de contratação
-- ---------------------------------------------------------------------------

insert into public.contract_types (slug, label, aliases, sort_order) values
  ('clt', 'CLT', '{efetivo,carteira assinada,celetista,full-time employee}', 1),
  ('pj', 'PJ', '{pessoa juridica,pessoa jurídica,cnpj,contrato pj}', 2),
  ('freelancer', 'Freelancer', '{freela,freelance,autonomo,autônomo,projeto pontual}', 3),
  ('contractor', 'Contractor', '{contract,contractor internacional,b2b,independent contractor}', 4),
  ('estagio', 'Estágio', '{estagiario,estagiário,intern,internship,trainee}', 5);

-- ---------------------------------------------------------------------------
-- Senioridade (rank ordena de estágio a principal)
-- ---------------------------------------------------------------------------

insert into public.seniority_levels (slug, label, aliases, rank, sort_order) values
  ('estagio', 'Estágio', '{estagiario,estagiário,intern,internship}', 1, 1),
  ('junior', 'Júnior', '{jr,junior,entry level,iniciante,trainee}', 2, 2),
  ('pleno', 'Pleno', '{pl,mid,mid-level,middle,intermediario,intermediário}', 3, 3),
  ('senior', 'Sênior', '{sr,senior,sênior,experiente}', 4, 4),
  ('especialista', 'Especialista', '{specialist,expert,lead,tech lead}', 5, 5),
  ('staff', 'Staff', '{staff engineer,staff-engineer}', 6, 6),
  ('principal', 'Principal', '{principal engineer,distinguished,architect,arquiteto}', 7, 7);

-- ---------------------------------------------------------------------------
-- Categorias de cargo
-- ---------------------------------------------------------------------------

insert into public.role_categories (slug, label, aliases, sort_order) values
  ('backend', 'Backend', '{back-end,back end,servidor,api developer}', 1),
  ('frontend', 'Frontend', '{front-end,front end,web developer,ui developer}', 2),
  ('fullstack', 'Fullstack', '{full-stack,full stack,desenvolvedor full stack}', 3),
  ('mobile', 'Mobile', '{android,ios,desenvolvedor mobile,app developer}', 4),
  ('qa', 'QA e Testes', '{quality assurance,tester,analista de testes,sdet,qa engineer}', 5),
  ('sre', 'SRE', '{site reliability,confiabilidade,reliability engineer}', 6),
  ('devops', 'DevOps', '{plataforma,platform engineer,engenharia de plataforma}', 7),
  ('dba', 'DBA', '{administrador de banco,database administrator}', 8),
  ('data-engineer', 'Engenharia de Dados', '{data engineer,engenheiro de dados,etl,pipeline de dados}', 9),
  ('data-science', 'Ciência de Dados', '{data scientist,cientista de dados,analista de dados,data analyst}', 10),
  ('machine-learning', 'Machine Learning', '{ml engineer,aprendizado de maquina,aprendizado de máquina,mlops}', 11),
  ('ai-engineer', 'Engenharia de IA', '{ai engineer,engenheiro de ia,llm engineer,genai}', 12),
  ('product-manager', 'Produto', '{product manager,gerente de produto,po,product owner,pm}', 13),
  ('project-manager', 'Projetos', '{project manager,gerente de projetos,scrum master,agilista}', 14),
  ('design', 'Design', '{designer,design grafico,design gráfico,ui designer}', 15),
  ('ux', 'UX', '{user experience,ux designer,ux research,pesquisa de usuario}', 16),
  ('security', 'Segurança', '{seguranca,security engineer,appsec,cybersecurity,pentest}', 17),
  ('cloud', 'Cloud', '{cloud engineer,arquiteto cloud,cloud architect}', 18),
  ('suporte', 'Suporte', '{support,service desk,helpdesk,suporte tecnico,suporte técnico}', 19),
  ('infraestrutura', 'Infraestrutura', '{infra,infrastructure,redes,sysadmin,administrador de sistemas}', 20);

-- ---------------------------------------------------------------------------
-- Tecnologias
-- ---------------------------------------------------------------------------

insert into public.technologies (slug, label, kind, aliases) values
  -- Linguagens
  ('javascript', 'JavaScript', 'language', '{js,ecmascript,es6}'),
  ('typescript', 'TypeScript', 'language', '{ts}'),
  ('python', 'Python', 'language', '{py,python3}'),
  ('java', 'Java', 'language', '{jdk,java se,java ee}'),
  ('go', 'Go', 'language', '{golang}'),
  ('csharp', 'C#', 'language', '{c sharp,c-sharp,dotnet c#}'),
  ('ruby', 'Ruby', 'language', '{}'),
  ('php', 'PHP', 'language', '{}'),
  ('kotlin', 'Kotlin', 'language', '{}'),
  ('swift', 'Swift', 'language', '{}'),
  ('rust', 'Rust', 'language', '{}'),
  ('elixir', 'Elixir', 'language', '{}'),
  ('scala', 'Scala', 'language', '{}'),
  ('dart', 'Dart', 'language', '{}'),
  ('c', 'C', 'language', '{linguagem c,ansi c}'),
  ('cpp', 'C++', 'language', '{c plus plus,cplusplus}'),
  ('r', 'R', 'language', '{linguagem r}'),
  ('perl', 'Perl', 'language', '{}'),
  ('lua', 'Lua', 'language', '{}'),
  ('objective-c', 'Objective-C', 'language', '{objc}'),
  ('sql', 'SQL', 'language', '{ansi sql}'),
  ('shell', 'Shell Script', 'language', '{bash,sh,zsh,shell script}'),
  ('groovy', 'Groovy', 'language', '{}'),
  ('clojure', 'Clojure', 'language', '{}'),
  ('haskell', 'Haskell', 'language', '{}'),
  ('erlang', 'Erlang', 'language', '{}'),
  ('solidity', 'Solidity', 'language', '{}'),
  ('abap', 'ABAP', 'language', '{sap abap}'),
  ('cobol', 'COBOL', 'language', '{}'),
  ('delphi', 'Delphi', 'language', '{object pascal}'),

  -- Frameworks e bibliotecas
  ('react', 'React', 'framework', '{reactjs,react.js}'),
  ('nextjs', 'Next.js', 'framework', '{next,nextjs,next js}'),
  ('angular', 'Angular', 'framework', '{angularjs,angular 2+}'),
  ('vuejs', 'Vue.js', 'framework', '{vue,vuejs}'),
  ('svelte', 'Svelte', 'framework', '{sveltekit}'),
  ('nodejs', 'Node.js', 'framework', '{node,nodejs,node js}'),
  ('nestjs', 'NestJS', 'framework', '{nest}'),
  ('express', 'Express', 'framework', '{expressjs}'),
  ('spring', 'Spring', 'framework', '{spring framework}'),
  ('spring-boot', 'Spring Boot', 'framework', '{springboot}'),
  ('dotnet', '.NET', 'framework', '{net core,dotnet core,.net core,net 8}'),
  ('aspnet', 'ASP.NET', 'framework', '{asp net,asp.net core}'),
  ('django', 'Django', 'framework', '{}'),
  ('flask', 'Flask', 'framework', '{}'),
  ('fastapi', 'FastAPI', 'framework', '{fast api}'),
  ('rails', 'Ruby on Rails', 'framework', '{rails,ror}'),
  ('laravel', 'Laravel', 'framework', '{}'),
  ('symfony', 'Symfony', 'framework', '{}'),
  ('flutter', 'Flutter', 'framework', '{}'),
  ('react-native', 'React Native', 'framework', '{rn,reactnative}'),
  ('ionic', 'Ionic', 'framework', '{}'),
  ('jquery', 'jQuery', 'framework', '{}'),
  ('remix', 'Remix', 'framework', '{react router 7}'),
  ('astro', 'Astro', 'framework', '{}'),
  ('nuxt', 'Nuxt', 'framework', '{nuxtjs}'),
  ('tailwindcss', 'Tailwind CSS', 'framework', '{tailwind}'),
  ('bootstrap', 'Bootstrap', 'framework', '{}'),
  ('graphql', 'GraphQL', 'framework', '{apollo}'),
  ('grpc', 'gRPC', 'framework', '{protobuf,protocol buffers}'),
  ('quarkus', 'Quarkus', 'framework', '{}'),
  ('hibernate', 'Hibernate', 'framework', '{jpa}'),
  ('pytorch', 'PyTorch', 'framework', '{torch}'),
  ('tensorflow', 'TensorFlow', 'framework', '{keras}'),
  ('scikit-learn', 'scikit-learn', 'framework', '{sklearn}'),
  ('pandas', 'pandas', 'framework', '{}'),
  ('spark', 'Apache Spark', 'framework', '{pyspark,spark}'),
  ('airflow', 'Apache Airflow', 'framework', '{airflow}'),
  ('dbt', 'dbt', 'framework', '{data build tool}'),
  ('langchain', 'LangChain', 'framework', '{}'),

  -- Bancos de dados
  ('postgresql', 'PostgreSQL', 'database', '{postgres,pgsql,psql}'),
  ('mysql', 'MySQL', 'database', '{}'),
  ('mongodb', 'MongoDB', 'database', '{mongo}'),
  ('redis', 'Redis', 'database', '{}'),
  ('sqlserver', 'SQL Server', 'database', '{mssql,microsoft sql server,t-sql}'),
  ('oracle-db', 'Oracle Database', 'database', '{oracle,pl/sql,plsql}'),
  ('dynamodb', 'DynamoDB', 'database', '{}'),
  ('elasticsearch', 'Elasticsearch', 'database', '{elastic,opensearch}'),
  ('cassandra', 'Cassandra', 'database', '{}'),
  ('mariadb', 'MariaDB', 'database', '{}'),
  ('sqlite', 'SQLite', 'database', '{}'),
  ('firebase', 'Firebase', 'database', '{firestore}'),
  ('supabase', 'Supabase', 'database', '{}'),
  ('neo4j', 'Neo4j', 'database', '{}'),
  ('clickhouse', 'ClickHouse', 'database', '{}'),
  ('snowflake', 'Snowflake', 'database', '{}'),
  ('bigquery', 'BigQuery', 'database', '{big query}'),
  ('redshift', 'Redshift', 'database', '{amazon redshift}'),
  ('databricks', 'Databricks', 'database', '{}'),
  ('cosmosdb', 'Cosmos DB', 'database', '{cosmos db,azure cosmos}'),

  -- Cloud
  ('aws', 'AWS', 'cloud', '{amazon web services,amazon aws}'),
  ('azure', 'Azure', 'cloud', '{microsoft azure}'),
  ('gcp', 'Google Cloud', 'cloud', '{google cloud platform,gcp}'),
  ('vercel', 'Vercel', 'cloud', '{}'),
  ('cloudflare', 'Cloudflare', 'cloud', '{cloudflare workers}'),
  ('digitalocean', 'DigitalOcean', 'cloud', '{digital ocean}'),
  ('heroku', 'Heroku', 'cloud', '{}'),
  ('netlify', 'Netlify', 'cloud', '{}'),
  ('oracle-cloud', 'Oracle Cloud', 'cloud', '{oci}'),
  ('ibm-cloud', 'IBM Cloud', 'cloud', '{}'),

  -- Ferramentas e plataformas
  ('docker', 'Docker', 'tool', '{containers,conteineres}'),
  ('kubernetes', 'Kubernetes', 'tool', '{k8s,kubernets}'),
  ('terraform', 'Terraform', 'tool', '{iac,infrastructure as code}'),
  ('ansible', 'Ansible', 'tool', '{}'),
  ('kafka', 'Apache Kafka', 'tool', '{kafka}'),
  ('rabbitmq', 'RabbitMQ', 'tool', '{rabbit mq}'),
  ('git', 'Git', 'tool', '{versionamento}'),
  ('github-actions', 'GitHub Actions', 'tool', '{gh actions}'),
  ('gitlab-ci', 'GitLab CI', 'tool', '{gitlab ci/cd}'),
  ('jenkins', 'Jenkins', 'tool', '{}'),
  ('jira', 'Jira', 'tool', '{atlassian jira}'),
  ('figma', 'Figma', 'tool', '{}'),
  ('linux', 'Linux', 'tool', '{unix,ubuntu,debian,red hat}'),
  ('nginx', 'Nginx', 'tool', '{}'),
  ('prometheus', 'Prometheus', 'tool', '{}'),
  ('grafana', 'Grafana', 'tool', '{}'),
  ('datadog', 'Datadog', 'tool', '{}'),
  ('sentry', 'Sentry', 'tool', '{}'),
  ('argocd', 'Argo CD', 'tool', '{argo cd,gitops}'),
  ('helm', 'Helm', 'tool', '{}'),
  ('openshift', 'OpenShift', 'tool', '{}'),
  ('selenium', 'Selenium', 'tool', '{}'),
  ('cypress', 'Cypress', 'tool', '{}'),
  ('playwright', 'Playwright', 'tool', '{}'),
  ('jest', 'Jest', 'tool', '{}'),
  ('junit', 'JUnit', 'tool', '{}'),
  ('pytest', 'pytest', 'tool', '{}'),
  ('postman', 'Postman', 'tool', '{}'),
  ('swagger', 'Swagger', 'tool', '{openapi}'),
  ('power-bi', 'Power BI', 'tool', '{powerbi}'),
  ('tableau', 'Tableau', 'tool', '{}'),
  ('sap', 'SAP', 'tool', '{}'),
  ('salesforce', 'Salesforce', 'tool', '{}'),
  ('servicenow', 'ServiceNow', 'tool', '{}');

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

insert into public.tags (slug, label, aliases, sort_order) values
  ('primeiro-emprego', 'Primeiro emprego', '{sem experiencia,sem experiência,first job}', 1),
  ('banco-de-talentos', 'Banco de talentos', '{talent pool,cadastro reserva}', 2),
  ('afirmativa-para-mulheres', 'Afirmativa para mulheres', '{vaga afirmativa,women in tech,diversidade de genero}', 3),
  ('pcd', 'PcD', '{pessoa com deficiencia,pessoa com deficiência,inclusiva}', 4),
  ('internacional', 'Internacional', '{exterior,global,overseas,fora do brasil}', 5),
  ('startup', 'Startup', '{scale-up,early stage}', 6),
  ('big-tech', 'Big tech', '{faang,grande empresa}', 7),
  ('fintech', 'Fintech', '{banco digital,servicos financeiros}', 8);

-- ---------------------------------------------------------------------------
-- Empresas e vagas de exemplo
-- ---------------------------------------------------------------------------
--
-- Existem só para a listagem, os filtros e os testes terem o que exercitar.
-- Empresas e vagas são fictícias de propósito: dados inventados atribuídos a
-- empresas reais seriam enganosos se algum dia escapassem do ambiente local.
-- Este arquivo roda apenas em `supabase db reset` (local e CI).

insert into public.companies (name, slug, website) values
  ('Aurora Pagamentos', 'aurora-pagamentos', 'https://aurora.exemplo.test'),
  ('Verde Logística', 'verde-logistica', 'https://verde.exemplo.test'),
  ('Tucano Tech', 'tucano-tech', 'https://tucano.exemplo.test'),
  ('Maré Digital', 'mare-digital', 'https://mare.exemplo.test'),
  ('Cerrado Saúde', 'cerrado-saude', 'https://cerrado.exemplo.test'),
  ('Farol Educação', 'farol-educacao', 'https://farol.exemplo.test'),
  ('Bandeira Games', 'bandeira-games', 'https://bandeira.exemplo.test');

with dados (
  slug, title, company_slug, role_slug, seniority_slug, work_mode_slug,
  contract_slug, city, state, country, salary_min, salary_max, currency,
  status, dias_desde_publicacao, language, summary, description_md
) as (
  values
    ('pessoa-desenvolvedora-backend-aurora-pagamentos-a1b2c3',
     'Pessoa Desenvolvedora Backend', 'aurora-pagamentos', 'backend', 'senior',
     'remoto', 'clt', null, null, 'BR', 15000, 22000, 'BRL', 'published', 1, 'pt-BR',
     'Time de pagamentos instantâneos, com Go e Postgres em escala de milhões de transações por dia.',
     E'## Sobre a vaga\n\nVocê vai trabalhar no núcleo de pagamentos instantâneos, cuidando de serviços que processam milhões de transações por dia.\n\n## O que você vai fazer\n\n- Evoluir serviços em **Go** com foco em latência e confiabilidade\n- Modelar dados em **PostgreSQL** pensando em consistência financeira\n- Participar do plantão do time (escala justa, com compensação)\n\n## O que esperamos\n\n- Experiência com sistemas distribuídos em produção\n- Conforto com observabilidade: métricas, tracing e log estruturado'),

    ('pessoa-desenvolvedora-frontend-tucano-tech-b2c3d4',
     'Pessoa Desenvolvedora Frontend', 'tucano-tech', 'frontend', 'pleno',
     'hibrido', 'clt', 'São Paulo', 'SP', 'BR', 9000, 13000, 'BRL', 'published', 2, 'pt-BR',
     'Interface de um produto de dados usado por times de operação, em React e TypeScript.',
     E'## Sobre a vaga\n\nNosso produto de dados é usado todos os dias por times de operação. A interface precisa ser rápida e clara.\n\n## O que você vai fazer\n\n- Construir telas em **React** e **TypeScript**\n- Cuidar de acessibilidade e performance de verdade, não como checklist\n- Trabalhar lado a lado com design e produto\n\n## O que esperamos\n\n- Experiência com React em produto real\n- Gosto por CSS bem feito'),

    ('estagio-em-desenvolvimento-farol-educacao-c3d4e5',
     'Estágio em Desenvolvimento', 'farol-educacao', 'fullstack', 'estagio',
     'remoto', 'estagio', null, null, 'BR', 2200, 2200, 'BRL', 'published', 3, 'pt-BR',
     'Primeira experiência em tecnologia, com acompanhamento de pessoa mentora e sem exigência de experiência prévia.',
     E'## Sobre a vaga\n\nEsta é uma vaga para quem está começando. Não pedimos experiência anterior — pedimos vontade de aprender.\n\n## O que você vai fazer\n\n- Participar do desenvolvimento de funcionalidades pequenas, com apoio\n- Aprender **JavaScript**, **Node.js** e banco de dados na prática\n- Ter uma pessoa mentora dedicada e revisão de código gentil\n\n## O que esperamos\n\n- Estar cursando graduação ou curso técnico\n- Curiosidade e comunicação'),

    ('engenheiro-de-dados-verde-logistica-d4e5f6',
     'Engenharia de Dados', 'verde-logistica', 'data-engineer', 'pleno',
     'remoto', 'pj', null, null, 'BR', 12000, 16000, 'BRL', 'published', 4, 'pt-BR',
     'Pipelines de rastreamento de entregas com Python, Airflow e BigQuery.',
     E'## Sobre a vaga\n\nCada entrega gera eventos que precisam virar informação confiável para operação e clientes.\n\n## O que você vai fazer\n\n- Construir pipelines em **Python** orquestrados com **Airflow**\n- Modelar dados no **BigQuery** com **dbt**\n- Definir contratos de dados com os times que produzem os eventos'),

    ('pessoa-desenvolvedora-mobile-mare-digital-e5f6a7',
     'Pessoa Desenvolvedora Mobile', 'mare-digital', 'mobile', 'senior',
     'presencial', 'clt', 'Recife', 'PE', 'BR', 14000, 19000, 'BRL', 'published', 5, 'pt-BR',
     'Aplicativo de serviços náuticos em React Native, com uso offline em alto-mar.',
     E'## Sobre a vaga\n\nNosso aplicativo é usado em alto-mar, onde conexão é luxo. Offline-first não é enfeite: é requisito.\n\n## O que você vai fazer\n\n- Evoluir o app em **React Native**\n- Resolver sincronização e conflito de dados offline\n- Cuidar de bateria e consumo de rede'),

    ('sre-aurora-pagamentos-f6a7b8',
     'Site Reliability Engineering', 'aurora-pagamentos', 'sre', 'especialista',
     'remoto', 'clt', null, null, 'BR', 18000, 26000, 'BRL', 'published', 6, 'pt-BR',
     'Confiabilidade de uma plataforma financeira, com Kubernetes, Terraform e cultura de postmortem sem culpa.',
     E'## Sobre a vaga\n\nConfiabilidade aqui é requisito de negócio: quando o pagamento falha, alguém não recebe.\n\n## O que você vai fazer\n\n- Cuidar de clusters **Kubernetes** e infraestrutura como código com **Terraform**\n- Definir SLOs junto com os times de produto\n- Conduzir postmortems sem busca por culpado'),

    ('qa-automation-cerrado-saude-a7b8c9',
     'Pessoa de QA e Automação', 'cerrado-saude', 'qa', 'pleno',
     'hibrido', 'clt', 'Goiânia', 'GO', 'BR', 8000, 11000, 'BRL', 'published', 7, 'pt-BR',
     'Qualidade em sistemas de saúde, onde bug tem consequência clínica.',
     E'## Sobre a vaga\n\nEm software de saúde, um bug pode virar consequência clínica. Qualidade aqui tem peso.\n\n## O que você vai fazer\n\n- Escrever testes automatizados com **Cypress** e **pytest**\n- Trabalhar junto do time desde o refinamento, não só no fim\n- Cuidar de dados sensíveis com responsabilidade (LGPD)'),

    ('pessoa-desenvolvedora-fullstack-bandeira-games-b8c9d0',
     'Pessoa Desenvolvedora Fullstack', 'bandeira-games', 'fullstack', 'junior',
     'remoto', 'clt', null, null, 'BR', 6000, 8500, 'BRL', 'published', 8, 'pt-BR',
     'Ferramentas internas para times de criação de jogos, com Next.js e Node.',
     E'## Sobre a vaga\n\nNosso time de ferramentas existe para que quem cria jogos perca menos tempo com processo.\n\n## O que você vai fazer\n\n- Construir ferramentas internas com **Next.js** e **Node.js**\n- Conversar com quem usa a ferramenta todo dia\n- Aprender com revisão de código e pareamento'),

    ('devops-engineer-tucano-tech-c9d0e1',
     'Pessoa de DevOps', 'tucano-tech', 'devops', 'senior',
     'remoto', 'contractor', null, null, 'BR', null, null, null, 'published', 9, 'pt-BR',
     'Plataforma interna de deploy para dezenas de times, com foco em autonomia.',
     E'## Sobre a vaga\n\nA plataforma existe para que cada time consiga entregar sem depender de nós.\n\n## O que você vai fazer\n\n- Evoluir a plataforma interna sobre **Kubernetes** e **Argo CD**\n- Automatizar com **Terraform** e **GitHub Actions**\n- Tratar quem usa a plataforma como cliente'),

    ('machine-learning-engineer-verde-logistica-d0e1f2',
     'Machine Learning Engineer', 'verde-logistica', 'machine-learning', 'senior',
     'remoto', 'pj', null, null, 'BR', 16000, 24000, 'BRL', 'published', 10, 'en',
     'Route optimization models in production, with Python and PyTorch.',
     E'## About the role\n\nWe optimize delivery routes for thousands of drivers every day. Models here go to production, not to slides.\n\n## What you will do\n\n- Build and ship models with **Python** and **PyTorch**\n- Own the full lifecycle: training, deployment and monitoring\n- Work close to the operations team'),

    ('pessoa-desenvolvedora-backend-cerrado-saude-e1f2a3',
     'Pessoa Desenvolvedora Backend', 'cerrado-saude', 'backend', 'pleno',
     'hibrido', 'clt', 'Brasília', 'DF', 'BR', 10000, 14000, 'BRL', 'published', 12, 'pt-BR',
     'APIs de prontuário eletrônico em Java e Spring, com integrações do SUS.',
     E'## Sobre a vaga\n\nNosso prontuário eletrônico conversa com sistemas públicos de saúde. Integração aqui é o trabalho.\n\n## O que você vai fazer\n\n- Evoluir APIs em **Java** com **Spring Boot**\n- Integrar com sistemas legados sem quebrar quem depende deles\n- Cuidar de auditoria e rastreabilidade de acesso a dados clínicos'),

    ('designer-de-produto-mare-digital-f2a3b4',
     'Design de Produto', 'mare-digital', 'design', 'pleno',
     'remoto', 'clt', null, null, 'BR', 9000, 12000, 'BRL', 'published', 14, 'pt-BR',
     'Design de produto com pesquisa junto de quem usa, em um time pequeno e autônomo.',
     E'## Sobre a vaga\n\nTime pequeno, decisões perto de quem usa o produto.\n\n## O que você vai fazer\n\n- Conduzir pesquisa e transformar achado em decisão de produto\n- Manter e evoluir nosso design system no **Figma**\n- Trabalhar junto do desenvolvimento desde o começo'),

    ('pessoa-desenvolvedora-python-farol-educacao-a3b4c5',
     'Pessoa Desenvolvedora Python', 'farol-educacao', 'backend', 'junior',
     'remoto', 'clt', null, null, 'BR', 5500, 7500, 'BRL', 'archived', 45, 'pt-BR',
     'Plataforma de ensino a distância com Django, para escolas públicas.',
     E'## Sobre a vaga\n\nNossa plataforma atende escolas públicas. O que fazemos chega em lugar com internet ruim e computador antigo.\n\n## O que você vai fazer\n\n- Evoluir a plataforma em **Python** com **Django**\n- Otimizar para conexões lentas\n- Aprender com pareamento e revisão'),

    ('arquiteto-de-solucoes-aurora-pagamentos-b4c5d6',
     'Arquitetura de Soluções', 'aurora-pagamentos', 'cloud', 'principal',
     'hibrido', 'clt', 'São Paulo', 'SP', 'BR', 25000, 35000, 'BRL', 'archived', 60, 'pt-BR',
     'Arquitetura de plataforma financeira multi-cloud, com AWS e Azure.',
     E'## Sobre a vaga\n\nDecisões de arquitetura aqui duram anos e afetam dezenas de times.\n\n## O que você vai fazer\n\n- Desenhar arquitetura sobre **AWS** e **Azure**\n- Escrever ADRs e defender decisões em revisão\n- Formar outras pessoas na organização'),

    ('suporte-tecnico-bandeira-games-c5d6e7',
     'Suporte Técnico', 'bandeira-games', 'suporte', 'junior',
     'presencial', 'clt', 'Porto Alegre', 'RS', 'BR', 3500, 4800, 'BRL', 'archived', 50, 'pt-BR',
     'Atendimento técnico a estúdios parceiros, com foco em diagnóstico.',
     E'## Sobre a vaga\n\nEstúdios parceiros dependem da nossa ferramenta para entregar. Quando trava, você é quem destrava.\n\n## O que você vai fazer\n\n- Diagnosticar problemas em **Linux** e redes\n- Documentar cada caso para virar melhoria de produto\n- Escalar o que não for possível resolver na hora')
)
insert into public.jobs (
  slug, title, company_id, description_md, summary,
  role_category_id, seniority_id, work_mode_id, contract_type_id,
  location_city, location_state, location_country,
  salary_min, salary_max, salary_currency,
  source_url, source_url_hash, source_site, apply_url,
  status, published_at, expires_at, language, keywords
)
select
  d.slug,
  d.title,
  c.id,
  d.description_md,
  d.summary,
  rc.id,
  sl.id,
  wm.id,
  ct.id,
  d.city,
  d.state,
  d.country::char(2),
  d.salary_min::numeric(12, 2),
  d.salary_max::numeric(12, 2),
  d.currency::char(3),
  'https://' || d.company_slug || '.exemplo.test/vagas/' || d.slug,
  -- sha256 da URL de verdade, e não um valor de fachada: é a chave de dedup
  -- (doc 04), e com um placeholder aqui reimportar uma vaga do seed criaria
  -- duplicata em vez de ser recusada. As URLs acima já são canônicas, então o
  -- hash bate com o que `hashDaUrl` calcula na aplicação.
  encode(
    extensions.digest(
      'https://' || d.company_slug || '.exemplo.test/vagas/' || d.slug,
      'sha256'
    ),
    'hex'
  ),
  'generic',
  'https://' || d.company_slug || '.exemplo.test/vagas/' || d.slug || '/candidatar',
  d.status::public.job_status,
  now() - (d.dias_desde_publicacao || ' days')::interval,
  now() - (d.dias_desde_publicacao || ' days')::interval + interval '30 days',
  d.language,
  string_to_array(d.role_slug || ',' || d.seniority_slug || ',' || d.work_mode_slug, ',')
from dados d
join public.companies c on c.slug = d.company_slug
left join public.role_categories rc on rc.slug = d.role_slug
left join public.seniority_levels sl on sl.slug = d.seniority_slug
left join public.work_modes wm on wm.slug = d.work_mode_slug
left join public.contract_types ct on ct.slug = d.contract_slug;

-- Tecnologias por vaga: a primeira de cada lista é a principal do card.
with vinculos (job_slug, tech_slugs) as (
  values
    ('pessoa-desenvolvedora-backend-aurora-pagamentos-a1b2c3', 'go,postgresql,kubernetes,docker'),
    ('pessoa-desenvolvedora-frontend-tucano-tech-b2c3d4', 'react,typescript,nextjs,tailwindcss'),
    ('estagio-em-desenvolvimento-farol-educacao-c3d4e5', 'javascript,nodejs,postgresql'),
    ('engenheiro-de-dados-verde-logistica-d4e5f6', 'python,airflow,bigquery,dbt'),
    ('pessoa-desenvolvedora-mobile-mare-digital-e5f6a7', 'react-native,typescript,sqlite'),
    ('sre-aurora-pagamentos-f6a7b8', 'kubernetes,terraform,prometheus,grafana,aws'),
    ('qa-automation-cerrado-saude-a7b8c9', 'cypress,pytest,python,postgresql'),
    ('pessoa-desenvolvedora-fullstack-bandeira-games-b8c9d0', 'nextjs,nodejs,typescript,postgresql'),
    ('devops-engineer-tucano-tech-c9d0e1', 'kubernetes,argocd,terraform,github-actions'),
    ('machine-learning-engineer-verde-logistica-d0e1f2', 'python,pytorch,gcp,docker'),
    ('pessoa-desenvolvedora-backend-cerrado-saude-e1f2a3', 'java,spring-boot,oracle-db,docker'),
    ('designer-de-produto-mare-digital-f2a3b4', 'figma'),
    ('pessoa-desenvolvedora-python-farol-educacao-a3b4c5', 'python,django,postgresql'),
    ('arquiteto-de-solucoes-aurora-pagamentos-b4c5d6', 'aws,azure,kubernetes,terraform'),
    ('suporte-tecnico-bandeira-games-c5d6e7', 'linux,git')
)
insert into public.job_technologies (job_id, technology_id, is_primary)
select
  j.id,
  t.id,
  tech.ordinality <= 3
from vinculos v
join public.jobs j on j.slug = v.job_slug
cross join lateral unnest(string_to_array(v.tech_slugs, ',')) with ordinality as tech(slug, ordinality)
join public.technologies t on t.slug = tech.slug;

with etiquetas (job_slug, tag_slugs) as (
  values
    ('pessoa-desenvolvedora-backend-aurora-pagamentos-a1b2c3', 'fintech'),
    ('sre-aurora-pagamentos-f6a7b8', 'fintech'),
    ('estagio-em-desenvolvimento-farol-educacao-c3d4e5', 'primeiro-emprego'),
    ('pessoa-desenvolvedora-fullstack-bandeira-games-b8c9d0', 'primeiro-emprego,startup'),
    ('machine-learning-engineer-verde-logistica-d0e1f2', 'internacional'),
    ('designer-de-produto-mare-digital-f2a3b4', 'startup')
)
insert into public.job_tags (job_id, tag_id)
select j.id, t.id
from etiquetas e
join public.jobs j on j.slug = e.job_slug
cross join lateral unnest(string_to_array(e.tag_slugs, ',')) as tag(slug)
join public.tags t on t.slug = tag.slug;

-- ---------------------------------------------------------------------------
-- Usuários de desenvolvimento, um por papel
-- ---------------------------------------------------------------------------
--
-- Existem apenas aqui, e este arquivo só roda em `supabase db reset` (local e
-- CI) — nunca em produção, onde papéis são promovidos manualmente por um admin.
--
-- Senha de todos: cfjobs-local
--   admin@cfjobs.local · editor@cfjobs.local · moderator@cfjobs.local ·
--   reader@cfjobs.local
--
-- Um por papel porque a matriz de autorização do doc 07 só é testável de
-- verdade com sessão de verdade: os testes de integração das Server Actions
-- entram pelo mesmo login de senha que uma pessoa usaria.

do $$
declare
  pessoa record;
begin
  for pessoa in
    select *
      from (values
        ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@cfjobs.local', 'Admin Local', 'admin'),
        ('00000000-0000-4000-8000-000000000002'::uuid, 'editor@cfjobs.local', 'Editor Local', 'editor'),
        ('00000000-0000-4000-8000-000000000003'::uuid, 'moderator@cfjobs.local', 'Moderação Local', 'moderator'),
        ('00000000-0000-4000-8000-000000000004'::uuid, 'reader@cfjobs.local', 'Leitor Local', 'reader')
      ) as t(id, email, nome, papel)
  loop
    -- As colunas de token precisam de string vazia: o serviço de auth lê todas
    -- como texto não nulo e falha com "Database error querying schema" se
    -- vierem NULL.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      pessoa.id,
      'authenticated',
      'authenticated',
      pessoa.email,
      extensions.crypt('cfjobs-local', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', pessoa.nome),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      pessoa.id::text,
      pessoa.id,
      jsonb_build_object('sub', pessoa.id::text, 'email', pessoa.email),
      'email',
      now(), now(), now()
    );

    -- O trigger handle_new_user() criou o perfil como `reader`.
    update public.profiles
       set role = pessoa.papel::public.user_role
     where id = pessoa.id;
  end loop;
end;
$$;
