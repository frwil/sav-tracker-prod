<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260115095031 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE building (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, max_capacity INT NOT NULL, customer_id INT NOT NULL, INDEX IDX_E16F61D49395C3F3 (customer_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE customer (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, zone VARCHAR(255) NOT NULL, exact_location VARCHAR(255) DEFAULT NULL, code VARCHAR(255) DEFAULT NULL, erp_code VARCHAR(255) DEFAULT NULL, erp_name VARCHAR(255) DEFAULT NULL, is_dealer TINYINT NOT NULL, is_direct_buyer TINYINT NOT NULL, relay_point_name VARCHAR(255) DEFAULT NULL, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE customer_speculation (customer_id INT NOT NULL, speculation_id INT NOT NULL, INDEX IDX_3FD5DA3E9395C3F3 (customer_id), INDEX IDX_3FD5DA3E5CB73291 (speculation_id), PRIMARY KEY (customer_id, speculation_id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE flock (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, subject_count INT NOT NULL, start_date DATETIME NOT NULL, end_date DATETIME DEFAULT NULL, closed TINYINT NOT NULL, speculation_id INT NOT NULL, building_id INT NOT NULL, INDEX IDX_769B31E25CB73291 (speculation_id), INDEX IDX_769B31E24D2A7E12 (building_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE observation (id INT AUTO_INCREMENT NOT NULL, type VARCHAR(255) NOT NULL, description LONGTEXT DEFAULT NULL, is_resolved TINYINT NOT NULL, visit_id INT NOT NULL, INDEX IDX_C576DBE075FA0FF2 (visit_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE speculation (id INT AUTO_INCREMENT NOT NULL, label VARCHAR(100) NOT NULL, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE visit (id INT AUTO_INCREMENT NOT NULL, visited_at DATETIME NOT NULL, gps_coordinates VARCHAR(255) DEFAULT NULL, technician_id INT NOT NULL, customer_id INT NOT NULL, INDEX IDX_437EE939E6C5D496 (technician_id), INDEX IDX_437EE9399395C3F3 (customer_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE building ADD CONSTRAINT FK_E16F61D49395C3F3 FOREIGN KEY (customer_id) REFERENCES customer (id)');
        $this->addSql('ALTER TABLE customer_speculation ADD CONSTRAINT FK_3FD5DA3E9395C3F3 FOREIGN KEY (customer_id) REFERENCES customer (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE customer_speculation ADD CONSTRAINT FK_3FD5DA3E5CB73291 FOREIGN KEY (speculation_id) REFERENCES speculation (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE flock ADD CONSTRAINT FK_769B31E25CB73291 FOREIGN KEY (speculation_id) REFERENCES speculation (id)');
        $this->addSql('ALTER TABLE flock ADD CONSTRAINT FK_769B31E24D2A7E12 FOREIGN KEY (building_id) REFERENCES building (id)');
        $this->addSql('ALTER TABLE observation ADD CONSTRAINT FK_C576DBE075FA0FF2 FOREIGN KEY (visit_id) REFERENCES visit (id)');
        $this->addSql('ALTER TABLE visit ADD CONSTRAINT FK_437EE939E6C5D496 FOREIGN KEY (technician_id) REFERENCES `user` (id)');
        $this->addSql('ALTER TABLE visit ADD CONSTRAINT FK_437EE9399395C3F3 FOREIGN KEY (customer_id) REFERENCES customer (id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE building DROP FOREIGN KEY FK_E16F61D49395C3F3');
        $this->addSql('ALTER TABLE customer_speculation DROP FOREIGN KEY FK_3FD5DA3E9395C3F3');
        $this->addSql('ALTER TABLE customer_speculation DROP FOREIGN KEY FK_3FD5DA3E5CB73291');
        $this->addSql('ALTER TABLE flock DROP FOREIGN KEY FK_769B31E25CB73291');
        $this->addSql('ALTER TABLE flock DROP FOREIGN KEY FK_769B31E24D2A7E12');
        $this->addSql('ALTER TABLE observation DROP FOREIGN KEY FK_C576DBE075FA0FF2');
        $this->addSql('ALTER TABLE visit DROP FOREIGN KEY FK_437EE939E6C5D496');
        $this->addSql('ALTER TABLE visit DROP FOREIGN KEY FK_437EE9399395C3F3');
        $this->addSql('DROP TABLE building');
        $this->addSql('DROP TABLE customer');
        $this->addSql('DROP TABLE customer_speculation');
        $this->addSql('DROP TABLE flock');
        $this->addSql('DROP TABLE observation');
        $this->addSql('DROP TABLE speculation');
        $this->addSql('DROP TABLE visit');
    }
}
