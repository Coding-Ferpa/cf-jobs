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
-- Usuário administrador de desenvolvimento
-- ---------------------------------------------------------------------------
--
-- Existe apenas aqui, e este arquivo só roda em `supabase db reset` (local e
-- CI) — nunca em produção, onde papéis são promovidos manualmente por um admin.
-- Credenciais: admin@cfjobs.local / cfjobs-local

do $$
declare
  admin_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    admin_id,
    'authenticated',
    'authenticated',
    'admin@cfjobs.local',
    extensions.crypt('cfjobs-local', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin Local"}'
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    admin_id::text,
    admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@cfjobs.local'),
    'email',
    now(), now(), now()
  );

  -- O trigger handle_new_user() criou o perfil como `reader`.
  update public.profiles set role = 'admin' where id = admin_id;
end;
$$;
