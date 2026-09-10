output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "The ID of the Public Subnet"
  value       = aws_subnet.public.id
}

output "private_subnet_id" {
  description = "The ID of the Private Subnet"
  value       = aws_subnet.private.id
}

output "ec2_public_ip" {
  description = "Public IP address of the Web EC2 Instance"
  value       = aws_instance.web.public_ip
}

output "website_url" {
  description = "URL to access the EJS web application"
  value       = "http://${aws_instance.web.public_ip}"
}
