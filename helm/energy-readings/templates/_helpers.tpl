{{/*
Expand the name of the chart.
*/}}
{{- define "energy-readings.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "energy-readings.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
assignment-id: {{ .Values.global.assignmentId | quote }}
{{- end }}

{{/*
Selector labels for a given component (pass component name as $).
*/}}
{{- define "energy-readings.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}